import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // ── Fetch resolved results (non-archived picks only) ─────────────────────
  const { data: results, error } = await supabase
    .from('results')
    .select('*, picks(*)')
    .neq('outcome', 'pending')
    .order('recorded_at', { ascending: false });

  if (error || !results) {
    return res.status(200).json({ picks: [], stats: {}, sharpStats: {}, longshotStats: {}, pendingPicks: [] });
  }

  // Filter out archived picks — these are pre-fresh-start records
  const activeResults = results.filter(r => r.picks?.archived !== true);

  // ── Fetch pending picks (picks without a completed result) ────────────────
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPicks } = await supabase
    .from('picks')
    .select('*, results(*)')
    .gte('game_time', cutoff)
    .eq('archived', false)
    .order('created_at', { ascending: false });

  const pendingPicks = (recentPicks || []).filter(p =>
    !p.results?.length || p.results[0]?.outcome === 'pending'
  );

  // ── Helper: compute stats for a result subset ─────────────────────────────
  function calcStats(subset) {
    const wins   = subset.filter(r => r.outcome === 'win').length;
    const losses = subset.filter(r => r.outcome === 'loss').length;
    const pushes = subset.filter(r => r.outcome === 'push').length;
    const total  = wins + losses + pushes;
    const winRate = total > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';

    // Units-based ROI (preferred) — requires units_result column on picks
    const picksWithUnits = subset.filter(r => r.picks?.units_result != null);
    let roiUnits = null;
    if (picksWithUnits.length > 0) {
      const totalResult  = picksWithUnits.reduce((sum, r) => sum + (r.picks.units_result || 0), 0);
      const totalWagered = picksWithUnits.reduce((sum, r) => sum + (r.picks.units_wagered || 1.0), 0);
      roiUnits = totalWagered > 0
        ? ((totalResult / totalWagered) * 100).toFixed(1)
        : '0.0';
    }

    // Flat $100 fallback (always computed — used if units data not yet available)
    let roiFlat = 0;
    subset.forEach(r => {
      if (r.outcome === 'win') {
        const odds = r.picks?.odds || 0;
        const profit = odds > 0 ? odds : (10000 / Math.abs(odds));
        roiFlat += profit;
      } else if (r.outcome === 'loss') {
        roiFlat -= 100;
      }
    });

    // Average EV at time of pick
    const evValues = subset
      .map(r => r.picks?.ev_percent)
      .filter(v => v != null && !isNaN(v));
    const avgEV = evValues.length > 0
      ? (evValues.reduce((a, b) => a + b, 0) / evValues.length).toFixed(1)
      : null;

    // Average CLV (only picks that have CLV data)
    const clvValues = subset
      .filter(r => r.picks?.clv != null)
      .map(r => r.picks.clv);
    const avgCLV = clvValues.length > 0
      ? (clvValues.reduce((a, b) => a + b, 0) / clvValues.length).toFixed(1)
      : null;

    return {
      total, wins, losses, pushes, winRate,
      roi: roiFlat.toFixed(0),
      roiPercent: total > 0 ? ((roiFlat / (total * 100)) * 100).toFixed(1) : '0.0',
      roiUnits,    // units-based ROI%, null until units_result column is populated
      avgEV,
      avgCLV,      // null until closing odds data is populated
    };
  }

  // ── Split by pick_type ────────────────────────────────────────────────────
  // Old picks without pick_type default to sharp
  const sharpResults    = activeResults.filter(r => !r.picks?.pick_type || r.picks?.pick_type === 'sharp');
  const longshotResults = activeResults.filter(r => r.picks?.pick_type === 'longshot');

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

  // ── Overall stats (all active results combined) ───────────────────────────
  const stats = calcStats(activeResults);

  return res.status(200).json({
    picks: activeResults.slice(0, 50),
    stats,
    sharpStats,
    longshotStats,
    pendingPicks: pendingPicks.slice(0, 20),
  });
}
