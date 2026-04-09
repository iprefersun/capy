import { createClient } from '@supabase/supabase-js';

// ── Team name normalization ───────────────────────────────────────────────────
// Strips and standardizes team names before comparing. Handles common variations
// between how picks save team names (from odds API) and how scores API returns them.
const TEAM_ALIASES = {
  // NBA
  'la lakers':           'los angeles lakers',
  'la clippers':         'los angeles clippers',
  'gs warriors':         'golden state warriors',
  'ny knicks':           'new york knicks',
  'nola pelicans':       'new orleans pelicans',
  'okc thunder':         'oklahoma city thunder',
  'sa spurs':            'san antonio spurs',
  // MLB
  'sox':                 null, // ambiguous — don't alias
  'white sox':           'chicago white sox',
  'red sox':             'boston red sox',
  'cubs':                'chicago cubs',
  // NFL
  'la rams':             'los angeles rams',
  'la chargers':         'los angeles chargers',
  'kc chiefs':           'kansas city chiefs',
  'sf 49ers':            'san francisco 49ers',
  'gb packers':          'green bay packers',
  'ne patriots':         'new england patriots',
  'tb buccaneers':       'tampa bay buccaneers',
  'ny giants':           'new york giants',
  'ny jets':             'new york jets',
  // NHL
  'tb lightning':        'tampa bay lightning',
  'lv golden knights':   'vegas golden knights',
  'la kings':            'los angeles kings',
};

function normalizeTeamName(name) {
  if (!name) return '';
  let n = name.toLowerCase().trim();
  // Remove punctuation (apostrophes, periods, etc.)
  n = n.replace(/['.]/g, '').replace(/\s+/g, ' ').trim();
  return TEAM_ALIASES[n] || n;
}

// Returns true if two team names refer to the same team after normalization.
// Also checks if one is a suffix of the other (e.g. "Lakers" matches "Los Angeles Lakers").
function teamsMatch(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Last-word suffix match: "Lakers" vs "Los Angeles Lakers"
  const lastA = na.split(' ').pop();
  const lastB = nb.split(' ').pop();
  if (lastA === lastB && lastA.length > 3) return true;
  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

// ── Date matching ─────────────────────────────────────────────────────────────
// Returns true if two ISO date strings are within 24 hours of each other (UTC).
function datesWithin24h(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const diff = Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime());
  return diff < 24 * 60 * 60 * 1000;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  console.log('[check-results] === Run started', new Date().toISOString(), '===');

  // ── Step 1: Schema probe ──────────────────────────────────────────────────
  {
    const { data: probe, error: probeErr } = await supabase
      .from('results')
      .select('pick_id, outcome, score_home, score_away, closing_line, recorded_at')
      .limit(1);

    if (probeErr) {
      console.error('[check-results] SCHEMA PROBE FAILED:', probeErr.message,
        '| hint:', probeErr.hint || '', '| details:', probeErr.details || '');
      console.error('[check-results] Expected columns: pick_id (uuid FK→picks.id), outcome (text), score_home (int), score_away (int), closing_line (int), recorded_at (timestamptz). Requires UNIQUE constraint on pick_id.');
    } else {
      console.log('[check-results] Schema probe OK — results table has expected columns');
    }
  }

  // ── Step 2: Fetch pending picks (last 14 days, expanded window) ───────────
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: pendingPicks, error: picksErr } = await supabase
    .from('picks')
    .select('*, results(*)')
    .gte('game_time', cutoff)
    .lte('game_time', now);

  if (picksErr) {
    console.error('[check-results] FAILED to fetch picks from Supabase:', picksErr.message);
    return res.status(500).json({ error: 'Failed to fetch picks', detail: picksErr.message });
  }

  if (!pendingPicks || pendingPicks.length === 0) {
    console.log('[check-results] No picks found in the last 14 days (game_time between', cutoff, 'and', now, ')');
    return res.status(200).json({ message: 'No picks in window', checked: 0, resolved: 0 });
  }

  // Log every pick so we can see what's in the DB
  console.log('[check-results] Total picks in 14-day window:', pendingPicks.length);
  pendingPicks.forEach((p, i) => {
    const existingResult = p.results?.[0];
    console.log(`[check-results] Pick[${i}] id=${p.id} sport=${p.sport} pick="${p.pick}" game_id=${p.game_id} game_time=${p.game_time} pick_type=${p.pick_type} results_count=${p.results?.length || 0} current_outcome=${existingResult?.outcome || 'none'}`);
  });

  // Filter to picks with no result or still pending
  const unresolved = pendingPicks.filter(p =>
    !p.results?.length || p.results[0]?.outcome === 'pending'
  );

  console.log('[check-results] Unresolved picks (no result or pending):', unresolved.length,
    '| already resolved:', pendingPicks.length - unresolved.length);

  if (!unresolved.length) {
    return res.status(200).json({ message: 'All picks already resolved', checked: 0, resolved: 0 });
  }

  const API_KEY = process.env.ODDS_API_KEY;
  const BDL_KEY = process.env.BALLDONTLIE_API_KEY;

  if (!API_KEY) {
    console.error('[check-results] ODDS_API_KEY env var is not set');
    return res.status(500).json({ error: 'Missing ODDS_API_KEY' });
  }

  // ── Step 3: Fetch scores per sport (sport-aware routing) ──────────────────
  // NBA → BallDontLie (game IDs differ from Odds API — match by team name + date only)
  // All other sports → The Odds API scores endpoint
  //
  // BallDontLie games are normalized into the same shape as Odds API games so
  // the matching loop in Step 4 can treat all sports uniformly.
  const scoresCache = {};
  let resolved = 0;
  let skipped = 0;
  let errors = 0;

  const uniqueSports = [...new Set(unresolved.map(p => p.sport).filter(Boolean))];
  console.log('[check-results] Unique sports to fetch scores for:', uniqueSports);

  // ── 3a: NBA via BallDontLie ───────────────────────────────────────────────
  if (uniqueSports.includes('basketball_nba')) {
    if (!BDL_KEY) {
      console.error('[check-results] BALLDONTLIE_API_KEY is not set — cannot fetch NBA scores');
      scoresCache['basketball_nba'] = [];
    } else {
      // Collect unique dates to query. Fetch the pick date plus adjacent days to
      // handle ET/UTC boundary (e.g. a 10pm ET game is the next UTC day).
      const nbaPickDates = new Set();
      for (const pick of unresolved.filter(p => p.sport === 'basketball_nba')) {
        if (!pick.game_time) continue;
        const d = new Date(pick.game_time);
        const utc = d.toISOString().split('T')[0];
        const prev = new Date(d.getTime() - 86400000).toISOString().split('T')[0];
        const next = new Date(d.getTime() + 86400000).toISOString().split('T')[0];
        nbaPickDates.add(prev);
        nbaPickDates.add(utc);
        nbaPickDates.add(next);
      }

      const allNbaGames = [];

      for (const date of nbaPickDates) {
        const url = `https://api.balldontlie.io/v1/games?dates[]=${date}`;
        console.log(`[check-results] Fetching BallDontLie NBA scores for date=${date}`);
        try {
          const bdlRes = await fetch(url, { headers: { 'Authorization': `Bearer ${BDL_KEY}` } });

          if (!bdlRes.ok) {
            const body = await bdlRes.text();
            console.error(`[check-results] BallDontLie HTTP ${bdlRes.status} for date=${date} | body: ${body.slice(0, 300)}`);
            continue;
          }

          const bdlJson = await bdlRes.json();
          const games = bdlJson?.data;

          if (!Array.isArray(games)) {
            console.error(`[check-results] BallDontLie returned non-array for date=${date}:`, JSON.stringify(bdlJson).slice(0, 200));
            continue;
          }

          const finalGames = games.filter(g => g.status === 'Final');
          console.log(`[check-results] BallDontLie date=${date}: total=${games.length} final=${finalGames.length}`);

          if (finalGames.length > 0) {
            finalGames.forEach(g => {
              console.log(`  bdl_id=${g.id} | ${g.visitor_team?.full_name} @ ${g.home_team?.full_name} | ${g.visitor_team_score}-${g.home_team_score} | status=${g.status}`);
            });
          }

          // Normalize to Odds API shape so Step 4 works unchanged.
          // NOTE: id is prefixed with "bdl_" so it will never accidentally
          // match an Odds API game_id stored in picks — matching is always by team + date.
          for (const g of games) {
            const homeName = g.home_team?.full_name || '';
            const awayName = g.visitor_team?.full_name || '';
            allNbaGames.push({
              id: `bdl_${g.id}`,
              completed: g.status === 'Final',
              home_team: homeName,
              away_team: awayName,
              commence_time: g.date, // ISO datetime returned by BDL
              scores: [
                { name: homeName, score: String(g.home_team_score ?? '') },
                { name: awayName, score: String(g.visitor_team_score ?? '') },
              ],
            });
          }

        } catch (err) {
          console.error(`[check-results] BallDontLie network error for date=${date}:`, err.message);
        }
      }

      scoresCache['basketball_nba'] = allNbaGames;
      console.log(`[check-results] NBA total games cached: ${allNbaGames.length} (${allNbaGames.filter(g => g.completed).length} final)`);
    }
  }

  // ── 3b: All other sports via The Odds API ─────────────────────────────────
  const nonNbaSports = uniqueSports.filter(s => s !== 'basketball_nba');

  for (const sport of nonNbaSports) {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${API_KEY}&daysFrom=3&dateFormat=iso`;
    console.log(`[check-results] Fetching Odds API scores: GET ${url.replace(API_KEY, 'REDACTED')}`);

    try {
      const scoreRes = await fetch(url);

      if (!scoreRes.ok) {
        const body = await scoreRes.text();
        console.error(`[check-results] Scores API HTTP ${scoreRes.status} for sport=${sport} | body: ${body.slice(0, 300)}`);
        scoresCache[sport] = [];
        continue;
      }

      const scoresJson = await scoreRes.json();

      if (!Array.isArray(scoresJson)) {
        console.error(`[check-results] Scores API returned non-array for sport=${sport}:`, JSON.stringify(scoresJson).slice(0, 300));
        scoresCache[sport] = [];
        continue;
      }

      scoresCache[sport] = scoresJson;

      const completed  = scoresJson.filter(g => g.completed === true);
      const inProgress = scoresJson.filter(g => g.completed === false && g.scores?.length);
      const scheduled  = scoresJson.filter(g => !g.scores?.length);
      console.log(`[check-results] Scores for ${sport}: total=${scoresJson.length} completed=${completed.length} in-progress=${inProgress.length} scheduled=${scheduled.length}`);

      if (completed.length > 0) {
        console.log(`[check-results] Completed games for ${sport}:`);
        completed.forEach(g => {
          const hs = g.scores?.find(s => s.name === g.home_team)?.score ?? '?';
          const as = g.scores?.find(s => s.name === g.away_team)?.score ?? '?';
          console.log(`  id=${g.id} | ${g.away_team} @ ${g.home_team} | ${as}-${hs} | commence=${g.commence_time}`);
        });
      } else {
        console.log(`[check-results] No completed games for ${sport} — ${scoresJson.length} games may be scheduled or in-progress`);
      }

    } catch (err) {
      console.error(`[check-results] Network error fetching scores for ${sport}:`, err.message);
      scoresCache[sport] = [];
    }
  }

  // ── Step 4: Match each pick to a completed game ───────────────────────────
  for (const pick of unresolved) {
    try {
      const sport = pick.sport;

      if (!sport) {
        console.warn(`[check-results] Pick ${pick.id} has no sport column — skipping`);
        skipped++;
        continue;
      }

      const scores = scoresCache[sport] || [];

      if (!scores.length) {
        console.log(`[check-results] Pick ${pick.id} (${pick.pick}) — no scores available for sport=${sport}`);
        skipped++;
        continue;
      }

      const scoresSource = sport === 'basketball_nba' ? 'BallDontLie' : 'OddsAPI';

      // ── Primary match: by game_id ─────────────────────────────────────────
      // NBA picks will always miss here because BallDontLie IDs (bdl_*) never
      // match The Odds API game_ids stored in picks — falls through to team+date.
      let game = scores.find(s => s.id === pick.game_id);

      if (game) {
        console.log(`[check-results] Pick ${pick.id} — game_id match FOUND via ${scoresSource}: ${game.away_team} @ ${game.home_team} | completed=${game.completed}`);
      } else {
        // ── Fallback match: team names + date within 24 hours ─────────────
        console.log(`[check-results] Pick ${pick.id} — game_id "${pick.game_id}" NOT found via ${scoresSource}. Trying team name + date fallback...`);
        console.log(`[check-results]   Looking for: home="${pick.home_team}" away="${pick.away_team}" pick="${pick.pick}" game_time=${pick.game_time}`);

        // Log what game_ids ARE in the scores to show the mismatch
        console.log(`[check-results]   Available game_ids for ${sport}: ${scores.slice(0, 10).map(s => s.id).join(', ')}${scores.length > 10 ? '...' : ''}`);

        game = scores.find(s => {
          const dateOk = datesWithin24h(s.commence_time, pick.game_time);
          const teamsOk = (
            (pick.home_team && teamsMatch(s.home_team, pick.home_team)) ||
            (pick.away_team && teamsMatch(s.away_team, pick.away_team)) ||
            (pick.pick && (teamsMatch(s.home_team, pick.pick) || teamsMatch(s.away_team, pick.pick)))
          );
          if (dateOk && teamsOk) {
            console.log(`[check-results]   Fallback match via ${scoresSource}: "${s.away_team} @ ${s.home_team}" id=${s.id} (date OK, teams matched)`);
          }
          return dateOk && teamsOk;
        });

        if (!game) {
          console.log(`[check-results] Pick ${pick.id} — NO MATCH by game_id or team names. Pick details: sport=${sport} pick="${pick.pick}" home="${pick.home_team}" away="${pick.away_team}" game_time=${pick.game_time}`);
          // Log the closest games by date for debugging
          const nearbyGames = scores
            .filter(s => datesWithin24h(s.commence_time, pick.game_time))
            .slice(0, 5);
          if (nearbyGames.length) {
            console.log(`[check-results]   Games within 24h of pick's game_time:`);
            nearbyGames.forEach(g => console.log(`    id=${g.id} | ${g.away_team} @ ${g.home_team} | completed=${g.completed}`));
          } else {
            console.log(`[check-results]   No games within 24h of game_time=${pick.game_time} — check if daysFrom=7 covers this date`);
          }
          skipped++;
          continue;
        }
      }

      // ── Check completion status ───────────────────────────────────────────
      if (!game.completed) {
        console.log(`[check-results] Pick ${pick.id} — game found but NOT YET COMPLETED: ${game.away_team} @ ${game.home_team} | completed=${game.completed} | scores=${JSON.stringify(game.scores)}`);
        skipped++;
        continue;
      }

      // ── Extract scores ────────────────────────────────────────────────────
      const homeScore = game.scores?.find(s => s.name === game.home_team)?.score;
      const awayScore = game.scores?.find(s => s.name === game.away_team)?.score;

      if (homeScore == null || awayScore == null) {
        console.warn(`[check-results] Pick ${pick.id} — game completed but MISSING SCORES: home=${homeScore} away=${awayScore} | game.scores=${JSON.stringify(game.scores)}`);
        skipped++;
        continue;
      }

      const homeInt = parseInt(homeScore, 10);
      const awayInt = parseInt(awayScore, 10);
      const homeWon = homeInt > awayInt;
      const awayWon = awayInt > homeInt;

      // ── Determine which side was picked ──────────────────────────────────
      const pickedHome = teamsMatch(pick.pick, game.home_team);
      const pickedAway = teamsMatch(pick.pick, game.away_team);

      console.log(`[check-results] Pick ${pick.id} | picked="${pick.pick}" home="${game.home_team}" away="${game.away_team}" | pickedHome=${pickedHome} pickedAway=${pickedAway} | score: ${game.away_team} ${awayInt} - ${homeInt} ${game.home_team}`);

      if (!pickedHome && !pickedAway) {
        console.warn(`[check-results] Pick ${pick.id} — TEAM NAME MISMATCH: pick="${pick.pick}" normalized="${normalizeTeamName(pick.pick)}" home="${game.home_team}" normalized="${normalizeTeamName(game.home_team)}" away="${game.away_team}" normalized="${normalizeTeamName(game.away_team)}"`);
        skipped++;
        continue;
      }

      // ── Compute outcome ───────────────────────────────────────────────────
      let outcome = 'pending';

      // bet_type column (renamed from pick_type) holds 'ml' or 'spread'.
      // Picks without bet_type (before schema change) default to ml resolution.
      if (pick.bet_type === 'ml' || !pick.bet_type) {
        if (pickedHome) {
          outcome = homeWon ? 'win' : awayWon ? 'loss' : 'push';
        } else {
          outcome = awayWon ? 'win' : homeWon ? 'loss' : 'push';
        }

      } else if (pick.pick_type === 'spread') {
        const margin = homeInt - awayInt;
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
        console.warn(`[check-results] Pick ${pick.id} — outcome could not be determined: pick_type=${pick.pick_type}`);
        skipped++;
        continue;
      }

      console.log(`[check-results] Pick ${pick.id} — outcome=${outcome} source=${scoresSource} | ${game.away_team} ${awayInt}-${homeInt} ${game.home_team}`);

      // ── Write result to Supabase ──────────────────────────────────────────
      const payload = {
        pick_id: pick.id,
        outcome,
        score_home: homeInt,
        score_away: awayInt,
        closing_line: pick.odds,
        recorded_at: new Date().toISOString(),
      };

      console.log(`[check-results] Writing to Supabase results table:`, JSON.stringify(payload));

      const { data: upsertData, error: upsertErr } = await supabase
        .from('results')
        .upsert(payload, { onConflict: 'pick_id' })
        .select();

      if (upsertErr) {
        console.error(`[check-results] SUPABASE UPSERT FAILED for pick ${pick.id}:`,
          '\n  message:', upsertErr.message,
          '\n  hint:', upsertErr.hint || '(none)',
          '\n  details:', upsertErr.details || '(none)',
          '\n  code:', upsertErr.code || '(none)',
          '\n  payload was:', JSON.stringify(payload));
        errors++;
        continue;
      }

      console.log(`[check-results] Supabase upsert SUCCESS for pick ${pick.id} | response rows:`, upsertData?.length ?? 0);
      resolved++;

    } catch (err) {
      console.error(`[check-results] UNEXPECTED ERROR for pick ${pick.id}:`, err.message, '\n', err.stack);
      errors++;
    }
  }

  console.log(`[check-results] === Run complete | checked=${unresolved.length} resolved=${resolved} skipped=${skipped} errors=${errors} ===`);

  return res.status(200).json({
    checked: unresolved.length,
    resolved,
    skipped,
    errors,
  });
}
