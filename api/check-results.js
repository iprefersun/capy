import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── Step 1: Schema probe ────────────────────────────────────────────────
  // Verify the results table exists and has the expected columns.
  // Expected: pick_id, outcome, score_home, score_away, closing_line, recorded_at
  {
    const { data: probe, error: probeErr } = await supabase
      .from('results')
      .select('pick_id, outcome, score_home, score_away, closing_line, recorded_at')
      .limit(1);

    if (probeErr) {
      const msg = probeErr.message || '';
      console.error('[check-results] Schema probe FAILED:', probeErr.message);
      if (msg.includes('does not exist') || msg.includes('relation')) {
        console.error('[check-results] The "results" table may not exist in Supabase. Create it with columns: pick_id (uuid FK → picks.id), outcome (text), score_home (int), score_away (int), closing_line (int), recorded_at (timestamptz). Add a UNIQUE constraint on pick_id.');
      }
      // Non-fatal — continue so we can still see what happens on upsert
    } else {
      console.log('[check-results] Schema probe OK — results table accessible');
    }
  }

  // ── Step 2: Fetch pending picks ─────────────────────────────────────────
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: pendingPicks, error: picksErr } = await supabase
    .from('picks')
    .select('*, results(*)')
    .gte('game_time', cutoff)
    .lte('game_time', now);

  if (picksErr) {
    console.error('[check-results] Failed to fetch picks from Supabase:', picksErr.message);
    return res.status(500).json({ error: 'Failed to fetch picks', detail: picksErr.message });
  }

  if (!pendingPicks || pendingPicks.length === 0) {
    console.log('[check-results] No picks in the last 7 days to check');
    return res.status(200).json({ message: 'No picks to check', checked: 0, resolved: 0 });
  }

  console.log('[check-results] Total picks in window:', pendingPicks.length);

  // Filter to picks with no result yet, or still pending
  const unresolved = pendingPicks.filter(p =>
    !p.results?.length || p.results[0]?.outcome === 'pending'
  );

  console.log('[check-results] Unresolved picks:', unresolved.length);

  if (!unresolved.length) {
    return res.status(200).json({ message: 'All picks already resolved', checked: 0, resolved: 0 });
  }

  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    console.error('[check-results] ODDS_API_KEY is not set');
    return res.status(500).json({ error: 'Missing ODDS_API_KEY' });
  }

  // Cache scores per sport so we don't re-fetch the same sport for every pick
  const scoresCache = {};
  let resolved = 0;
  let skipped = 0;
  let errors = 0;

  for (const pick of unresolved) {
    try {
      const sport = pick.sport;
      if (!sport) {
        console.warn('[check-results] Pick', pick.id, 'has no sport column — skipping');
        skipped++;
        continue;
      }

      // Fetch + cache scores for this sport (daysFrom=7 to cover a full week)
      if (!scoresCache[sport]) {
        const url = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${API_KEY}&daysFrom=7&dateFormat=iso`;
        console.log('[check-results] Fetching scores for sport:', sport);
        const scoreRes = await fetch(url);

        if (!scoreRes.ok) {
          console.error('[check-results] Scores API returned', scoreRes.status, 'for sport', sport);
          scoresCache[sport] = []; // cache empty so we don't retry in this run
          skipped++;
          continue;
        }

        const scoresJson = await scoreRes.json();
        // Odds API may return an error object instead of an array
        if (!Array.isArray(scoresJson)) {
          console.error('[check-results] Scores API returned non-array for sport', sport, ':', JSON.stringify(scoresJson).slice(0, 200));
          scoresCache[sport] = [];
          skipped++;
          continue;
        }

        scoresCache[sport] = scoresJson;
        console.log('[check-results] Cached', scoresJson.length, 'score records for', sport,
          '| completed:', scoresJson.filter(s => s.completed).length);
      }

      const scores = scoresCache[sport];
      const game = scores.find(s => s.id === pick.game_id);

      if (!game) {
        console.log('[check-results] Game not found in scores for pick', pick.id,
          '| game_id:', pick.game_id, '| sport:', sport);
        skipped++;
        continue;
      }

      if (!game.completed) {
        console.log('[check-results] Game not yet completed for pick', pick.id,
          '|', game.away_team, '@', game.home_team);
        skipped++;
        continue;
      }

      // ── Determine outcome ────────────────────────────────────────────────
      const homeScore = game.scores?.find(s => s.name === game.home_team)?.score;
      const awayScore = game.scores?.find(s => s.name === game.away_team)?.score;

      if (homeScore == null || awayScore == null) {
        console.warn('[check-results] Missing scores for completed game', pick.id,
          '| home:', homeScore, 'away:', awayScore);
        skipped++;
        continue;
      }

      const homeInt = parseInt(homeScore, 10);
      const awayInt = parseInt(awayScore, 10);
      const homeWon = homeInt > awayInt;
      const awayWon = awayInt > homeInt;

      let outcome = 'pending';

      if (pick.pick_type === 'ml') {
        const pickedHome = pick.pick === game.home_team ||
          (game.home_team && pick.pick?.includes(game.home_team.split(' ').pop()));
        if (pickedHome) {
          outcome = homeWon ? 'win' : awayWon ? 'loss' : 'push';
        } else {
          outcome = awayWon ? 'win' : homeWon ? 'loss' : 'push';
        }
        console.log('[check-results] ML pick', pick.id,
          '| picked:', pick.pick, '| pickedHome:', pickedHome,
          '| score:', homeInt, '-', awayInt, '| outcome:', outcome);

      } else if (pick.pick_type === 'spread') {
        const margin = homeInt - awayInt;
        const pickedHome = pick.pick === game.home_team ||
          (game.home_team && pick.pick?.includes(game.home_team.split(' ').pop()));
        const line = parseFloat(pick.line) || 0;
        if (pickedHome) {
          const adj = margin + line;
          outcome = adj > 0 ? 'win' : adj === 0 ? 'push' : 'loss';
        } else {
          const adj = awayInt - homeInt + line;
          outcome = adj > 0 ? 'win' : adj === 0 ? 'push' : 'loss';
        }
      }

      if (outcome === 'pending') {
        console.warn('[check-results] Could not determine outcome for pick', pick.id);
        skipped++;
        continue;
      }

      // ── Write result to Supabase ─────────────────────────────────────────
      const { data: upsertData, error: upsertErr } = await supabase
        .from('results')
        .upsert({
          pick_id: pick.id,
          outcome,
          score_home: homeInt,
          score_away: awayInt,
          closing_line: pick.odds, // use pick odds as closing line proxy until CLV data available
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'pick_id' })
        .select();

      if (upsertErr) {
        console.error('[check-results] Supabase upsert FAILED for pick', pick.id,
          '| outcome:', outcome,
          '| error:', upsertErr.message,
          '| hint:', upsertErr.hint || '',
          '| details:', upsertErr.details || '');
        errors++;
        continue;
      }

      resolved++;
      console.log('[check-results] Resolved pick', pick.id,
        '|', game.away_team, '@', game.home_team,
        '| outcome:', outcome,
        '| score:', homeInt, '-', awayInt);

    } catch (err) {
      console.error('[check-results] Unexpected error for pick', pick.id, ':', err.message, err.stack);
      errors++;
    }
  }

  console.log('[check-results] Done — checked:', unresolved.length,
    '| resolved:', resolved, '| skipped:', skipped, '| errors:', errors);

  return res.status(200).json({
    checked: unresolved.length,
    resolved,
    skipped,
    errors,
  });
}
