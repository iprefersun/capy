import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: results, error } = await supabase
    .from('results')
    .select('*, picks(*)')
    .neq('outcome', 'pending')
    .order('recorded_at', { ascending: false });

  if (error || !results) return res.status(200).json({ picks: [], stats: {}, sharpStats: {}, longshotStats: {} });

  // ── Helper: compute stats for a subset of results ──────────────────────
  function calcStats(subset) {
    const wins   = subset.filter(r => r.outcome === 'win').length;
    const losses = subset.filter(r => r.outcome === 'loss').length;
    const pushes = subset.filter(r => r.outcome === 'push').length;
    const total  = wins + losses + pushes;
    const winRate = total > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;

    // ROI: flat $100 bet on each pick
    let roi = 0;
    subset.forEach(r => {
      if (r.outcome === 'win') {
        const odds = r.picks?.odds || 0;
        const profit = odds > 0 ? odds : (10000 / Math.abs(odds));
        roi += profit;
      } else if (r.outcome === 'loss') {
        roi -= 100;
      }
    });

    // Average EV at time of pick
    const evValues = subset
      .map(r => r.picks?.ev_percent)
      .filter(v => v != null && !isNaN(v));
    const avgEV = evValues.length > 0
      ? (evValues.reduce((a, b) => a + b, 0) / evValues.length).toFixed(1)
      : null;

    return {
      total,
      wins,
      losses,
      pushes,
      winRate,
      roi: roi.toFixed(0),
      roiPercent: total > 0 ? ((roi / (total * 100)) * 100).toFixed(1) : 0,
      avgEV,
    };
  }

  // ── Split by pick_type ──────────────────────────────────────────────────
  // Picks without pick_type (older picks before the schema change) default to sharp
  const sharpResults    = results.filter(r => !r.picks?.pick_type || r.picks?.pick_type === 'sharp');
  const longshotResults = results.filter(r => r.picks?.pick_type === 'longshot');

  const sharpStats    = calcStats(sharpResults);
  const longshotStats = calcStats(longshotResults);

  // Biggest longshot winner: highest American odds win
  const biggestWinner = longshotResults
    .filter(r => r.outcome === 'win' && r.picks?.odds != null)
    .sort((a, b) => (b.picks.odds || 0) - (a.picks.odds || 0))[0] || null;

  if (biggestWinner) {
    longshotStats.biggestWinner = {
      pick: biggestWinner.picks?.pick,
      odds: biggestWinner.picks?.odds,
      recorded_at: biggestWinner.recorded_at,
    };
  }

  // ── Overall stats (all results combined) ───────────────────────────────
  const stats = calcStats(results);

  res.status(200).json({
    picks: results.slice(0, 50),
    stats,
    sharpStats,
    longshotStats,
  });
}
