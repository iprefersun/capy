import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // ── Fetch all non-archived bets ───────────────────────────────────────────
  const { data: allBets, error } = await supabase
    .from('bets')
    .select('*')
    .eq('archived', false)
    .order('date', { ascending: false });

  if (error || !allBets) {
    console.error('[get-stats] Failed to fetch bets:', error?.message);
    return res.status(200).json({
      overall: emptyStats(),
      byPickType: { sharp: emptyStats(), longshot: emptyStats() },
      bySport: [],
      byEvBucket: [],
      last7Days: [],
      clvStats: { avgClv: null, positiveRate: null, sampleSize: 0 },
      pendingCount: 0,
    });
  }

  const resolved = allBets.filter(b => b.result !== 'pending');
  const pending  = allBets.filter(b => b.result === 'pending');

  // ── Helper: compute stats for a resolved subset ───────────────────────────
  function calcStats(subset) {
    const wins   = subset.filter(b => b.result === 'win').length;
    const losses = subset.filter(b => b.result === 'loss').length;
    const pushes = subset.filter(b => b.result === 'push').length;
    const total  = wins + losses + pushes;
    const winRate = total > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : null;

    const totalProfit = subset.reduce((sum, b) => sum + (b.profit_units || 0), 0);
    const totalStake  = subset.reduce((sum, b) => sum + (b.stake_units  || 1.0), 0);
    const roiPercent  = totalStake > 0
      ? ((totalProfit / totalStake) * 100).toFixed(1)
      : null;

    const evValues = subset.map(b => b.ev_percent).filter(v => v != null && !isNaN(v));
    const avgEv    = evValues.length > 0
      ? (evValues.reduce((a, b) => a + b, 0) / evValues.length)
      : null;

    return {
      total,
      wins,
      losses,
      pushes,
      winRate,
      profitUnits: Math.round(totalProfit * 100) / 100,
      roiPercent,
      avgEv: avgEv != null ? Math.round(avgEv * 10000) / 100 : null, // convert 0.021 → 2.1
    };
  }

  function emptyStats() {
    return { total: 0, wins: 0, losses: 0, pushes: 0, winRate: null, profitUnits: 0, roiPercent: null, avgEv: null };
  }

  // ── Overall stats ─────────────────────────────────────────────────────────
  const overall = calcStats(resolved);

  // ── By pick_type ──────────────────────────────────────────────────────────
  const sharpResolved    = resolved.filter(b => !b.pick_type || b.pick_type === 'sharp');
  const longshotResolved = resolved.filter(b => b.pick_type === 'longshot');

  const byPickType = {
    sharp:    calcStats(sharpResolved),
    longshot: calcStats(longshotResolved),
  };

  // ── By sport ──────────────────────────────────────────────────────────────
  const sportMap = {};
  for (const b of resolved) {
    const sport = b.sport || 'unknown';
    if (!sportMap[sport]) sportMap[sport] = [];
    sportMap[sport].push(b);
  }

  const bySport = Object.entries(sportMap)
    .map(([sport, bets]) => ({ sport, ...calcStats(bets) }))
    .sort((a, b) => b.total - a.total);

  // ── By EV bucket ──────────────────────────────────────────────────────────
  // ev_percent in bets table is decimal: 0.021 = 2.1%
  function evBucket(ev) {
    if (ev == null) return null;
    if (ev >= 0.01 && ev < 0.02) return '1-2%';
    if (ev >= 0.02 && ev < 0.03) return '2-3%';
    if (ev >= 0.03 && ev <= 0.05) return '3-5%';
    return null;
  }

  const bucketMap = {};
  for (const b of resolved) {
    const bucket = evBucket(b.ev_percent);
    if (!bucket) continue;
    if (!bucketMap[bucket]) bucketMap[bucket] = [];
    bucketMap[bucket].push(b);
  }

  const bucketOrder = ['1-2%', '2-3%', '3-5%'];
  const byEvBucket = bucketOrder
    .filter(k => bucketMap[k])
    .map(k => ({ evBucket: k, ...calcStats(bucketMap[k]) }));

  // ── Last 7 days daily summary (all bets, including pending) ───────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentBets = allBets.filter(b => {
    if (!b.date) return false;
    return new Date(b.date) >= sevenDaysAgo;
  });

  const dayMap = {};
  for (const b of recentBets) {
    const day = b.date.split('T')[0];
    if (!dayMap[day]) dayMap[day] = { date: day, bets: 0, wins: 0, profitUnits: 0 };
    dayMap[day].bets++;
    if (b.result === 'win') dayMap[day].wins++;
    dayMap[day].profitUnits += b.profit_units || 0;
  }

  const last7Days = Object.values(dayMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, profitUnits: Math.round(d.profitUnits * 100) / 100 }));

  // ── CLV stats (resolved bets with CLV data) ───────────────────────────────
  const withClv   = resolved.filter(b => b.clv != null);
  const avgClv    = withClv.length > 0
    ? withClv.reduce((sum, b) => sum + b.clv, 0) / withClv.length
    : null;
  const positiveRate = withClv.length > 0
    ? (withClv.filter(b => b.clv > 0).length / withClv.length * 100).toFixed(1)
    : null;

  const clvStats = {
    avgClv:       avgClv != null ? Math.round(avgClv * 10000) / 10000 : null,
    positiveRate, // "% of bets that beat the closing line"
    sampleSize:   withClv.length,
  };

  return res.status(200).json({
    overall,
    byPickType,
    bySport,
    byEvBucket,
    last7Days,
    clvStats,
    pendingCount: pending.length,
  });
}
