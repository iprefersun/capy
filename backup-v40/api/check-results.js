import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Get all pending picks from the last 7 days
  const { data: pendingPicks } = await supabase
    .from('picks')
    .select('*, results(*)')
    .gte('game_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .lte('game_time', new Date().toISOString());

  if (!pendingPicks || pendingPicks.length === 0) {
    return res.status(200).json({ message: 'No pending picks to check' });
  }

  // Filter to picks that don't have a result yet or are still pending
  const unresolved = pendingPicks.filter(p =>
    !p.results?.length || p.results[0]?.outcome === 'pending'
  );

  const API_KEY = process.env.ODDS_API_KEY;
  let resolved = 0;

  for (const pick of unresolved) {
    try {
      // Fetch scores from The Odds API
      const scoreRes = await fetch(
        `https://api.the-odds-api.com/v4/sports/${pick.sport}/scores/?apiKey=${API_KEY}&daysFrom=3&dateFormat=iso`
      );
      const scores = await scoreRes.json();

      const game = scores.find(s => s.id === pick.game_id);
      if (!game || !game.completed) continue;

      // Determine outcome based on pick type
      let outcome = 'pending';
      const homeScore = game.scores?.find(s => s.name === game.home_team)?.score;
      const awayScore = game.scores?.find(s => s.name === game.away_team)?.score;

      if (homeScore !== undefined && awayScore !== undefined) {
        const homeWon = parseInt(homeScore) > parseInt(awayScore);
        const awayWon = parseInt(awayScore) > parseInt(homeScore);

        if (pick.pick_type === 'ml') {
          const pickedHome = pick.pick.includes(game.home_team);
          if (pickedHome) outcome = homeWon ? 'win' : 'loss';
          else outcome = awayWon ? 'win' : 'loss';
        } else if (pick.pick_type === 'spread') {
          const margin = parseInt(homeScore) - parseInt(awayScore);
          const pickedHome = pick.pick.includes(game.home_team);
          if (pickedHome) {
            const adjustedMargin = margin + pick.line;
            outcome = adjustedMargin > 0 ? 'win' : adjustedMargin === 0 ? 'push' : 'loss';
          } else {
            const adjustedMargin = margin - pick.line;
            outcome = adjustedMargin < 0 ? 'win' : adjustedMargin === 0 ? 'push' : 'loss';
          }
        }

        if (outcome !== 'pending') {
          // closing_line placeholder — update when closing line data is available
          const closingLine = pick.odds;

          await supabase.from('results').upsert({
            pick_id: pick.id,
            outcome,
            score_home: parseInt(homeScore),
            score_away: parseInt(awayScore),
            closing_line: closingLine,
            recorded_at: new Date().toISOString()
          }, { onConflict: 'pick_id' });

          resolved++;
          console.log(`[check-results] Resolved pick ${pick.id}: ${outcome}`);
        }
      }
    } catch (err) {
      console.error(`[check-results] Error checking pick ${pick.id}:`, err.message);
    }
  }

  res.status(200).json({ checked: unresolved.length, resolved });
}
