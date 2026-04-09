// ─────────────────────────────────────────────────────────────────────────────
// get-stats.js — Unified stats endpoint, routed by ?type=
//
// GET /api/get-stats              → type=stats (default) — analytics from bets table
// GET /api/get-stats?type=bets    → filtered raw bet list from bets table
// GET /api/get-stats?type=record  → win/loss record from results+picks tables
//
// Merged from: get-bets.js, get-record.js, get-stats.js
// Required env: SUPABASE_URL, SUPABASE_ANON_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const type = req.query.type || 'stats';

  if (type === 'bets')   return handleBets(req, res, supabase);
  if (type === 'record') return handleRecord(req, res, supabase);
  return handleStats(req, res, supabase);
}

// ── type=bets ─────────────────────────────────────────────────────────────────
// Filtered raw bet list from the bets table.
// Query params: sport, result, pick_type, days
async function handleBets(req, res, supabase) {
  const { sport, result, pick_type, days } = req.query;

  let query = supabase
    .from('bets')
    .select('*')
    .eq('archived', false)
    .order('date', { ascending: false })
    .limit(500);

  if (sport && sport !== 'all')         query = query.eq('sport', sport);
  if (result && result !== 'all')       query = query.eq('result', result);
  if (pick_type && pick_type !== 'all') query = query.eq('pick_type', pick_type);
  if (days && days !== 'all') {
    const cutoff = new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    query = query.gte('date', cutoff);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[get-stats/bets] Supabase error:', error.message);
    return res.status(500).json({ error: error.message, bets: [] });
  }

  return res.status(200).json({ bets: data || [] });
}

// ── type=record ───────────────────────────────────────────────────────────────
// Win/loss record built from the results+picks tables.
// Returns: { picks, stats, sharpStats, longshotStats, pendingPicks }
async function handleRecord(req, res, supabase) {
  const { data: results, error } = await supabase
    .from('results')
    .select('*, picks(*)')
    .neq('outcome', 'pending')
    .order('recorded_at', { ascending: false });

  if (error || !results) {
    return res.status(200).json({
      picks: [], stats: {}, sharpStats: {}, longshotStats: {}, pendingPicks: [],
    });
  }

  // Filter out archived picks
  const activeResults = results.filter(r => r.picks?.archived !== true);

  // Pending picks from the last 14 days without a completed result
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

  function calcStats(subset) {
    const wins   = subset.filter(r => r.outcome === 'win').length;
    const losses = subset.filter(r => r.outcome === 'loss').length;
    const pushes = subset.filter(r => r.outcome === 'push').length;
    const total  = wins + losses + pushes;
    const winRate = total > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';

    const picksWithUnits = subset.filter(r => r.picks?.units_result != null);
    let roiUnits = null;
    if (picksWithUnits.length > 0) {
      const totalResult  = picksWithUnits.reduce((sum, r) => sum + (r.picks.units_result || 0), 0);
      const totalWagered = picksWithUnits.reduce((sum, r) => sum + (r.picks.units_wagered || 1.0), 0);
      roiUnits = totalWagered > 0 ? ((totalResult / totalWagered) * 100).toFixed(1) : '0.0';
    }

    let roiFlat = 0;
    subset.forEach(r => {
      if (r.outcome === 'win') {
        const odds = r.picks?.odds || 0;
        roiFlat += odds > 0 ? odds : (10000 / Math.abs(odds));
      } else if (r.outcome === 'loss') {
        roiFlat -= 100;
      }
    });

    const evValues = subset.map(r => r.picks?.ev_percent).filter(v => v != null && !isNaN(v));
    const avgEV = evValues.length > 0
      ? (evValues.reduce((a, b) => a + b, 0) / evValues.length).toFixed(1)
      : null;

    const clvValues = subset.filter(r => r.picks?.clv != null).map(r => r.picks.clv);
    const avgCLV = clvValues.length > 0
      ? (clvValues.reduce((a, b) => a + b, 0) / clvValues.length).toFixed(1)
      : null;

    return {
      total, wins, losses, pushes, winRate,
      roi: roiFlat.toFixed(0),
      roiPercent: total > 0 ? ((roiFlat / (total * 100)) * 100).toFixed(1) : '0.0',
      roiUnits,
      avgEV,
      avgCLV,
    };
  }

  const sharpResults    = activeResults.filter(r => !r.picks?.pick_type || r.picks?.pick_type === 'sharp');
  const longshotResults = activeResults.filter(r => r.picks?.pick_type === 'longshot');

  const sharpStats    = calcStats(sharpResults);
  const longshotStats = calcStats(longshotResults);

  // Biggest longshot winner by American odds
  const biggestWinner = longshotResults
    .filter(r => r.outcome === 'win' && r.picks?.odds != null)
    .sort((a, b) => (b.picks.odds || 0) - (a.picks.odds || 0))[0] || null;

  if (biggestWinner) {
    longshotStats.biggestWinner = {
      pick:        biggestWinner.picks?.pick,
      odds:        biggestWinner.picks?.odds,
      recorded_at: biggestWinner.recorded_at,
    };
  }

  return res.status(200).json({
    picks:        activeResults.slice(0, 50),
    stats:        calcStats(activeResults),
    sharpStats,
    longshotStats,
    pendingPicks: pendingPicks.slice(0, 20),
  });
}

// ── type=stats (default) ──────────────────────────────────────────────────────
// Aggregated analytics from the bets table.
// Returns: { overall, byPickType, bySport, byEvBucket, last7Days, clvStats, pendingCount }
async function handleStats(req, res, supabase) {
  const { data: allBets, error } = await supabase
    .from('bets')
    .select('*')
    .eq('archived', false)
    .order('date', { ascending: false });

  if (error || !allBets) {
    console.error('[get-stats] Failed to fetch bets:', error?.message);
    return res.status(200).json({
      overall:     emptyStats(),
      byPickType:  { sharp: emptyStats(), longshot: emptyStats() },
      bySport:     [],
      byEvBucket:  [],
      last7Days:   [],
      clvStats:    { avgClv: null, positiveRate: null, sampleSize: 0 },
      pendingCount: 0,
    });
  }

  const resolved = allBets.filter(b => b.result !== 'pending');
  const pending  = allBets.filter(b => b.result === 'pending');

  function emptyStats() {
    return { total: 0, wins: 0, losses: 0, pushes: 0, winRate: null, profitUnits: 0, roiPercent: null, avgEv: null };
  }

  function calcStats(subset) {
    const wins   = subset.filter(b => b.result === 'win').length;
    const losses = subset.filter(b => b.result === 'loss').length;
    const pushes = subset.filter(b => b.result === 'push').length;
    const total  = wins + losses + pushes;
    const winRate = total > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : null;

    const totalProfit = subset.reduce((sum, b) => sum + (b.profit_units || 0), 0);
    const totalStake  = subset.reduce((sum, b) => sum + (b.stake_units  || 1.0), 0);
    const roiPercent  = totalStake > 0 ? ((totalProfit / totalStake) * 100).toFixed(1) : null;

    const evValues = subset.map(b => b.ev_percent).filter(v => v != null && !isNaN(v));
    const avgEv = evValues.length > 0
      ? (evValues.reduce((a, b) => a + b, 0) / evValues.length)
      : null;

    return {
      total, wins, losses, pushes, winRate,
      profitUnits: Math.round(totalProfit * 100) / 100,
      roiPercent,
      avgEv: avgEv != null ? Math.round(avgEv * 10000) / 100 : null, // 0.021 → 2.1
    };
  }

  // By pick_type
  const byPickType = {
    sharp:    calcStats(resolved.filter(b => !b.pick_type || b.pick_type === 'sharp')),
    longshot: calcStats(resolved.filter(b => b.pick_type === 'longshot')),
  };

  // By sport
  const sportMap = {};
  for (const b of resolved) {
    const sport = b.sport || 'unknown';
    if (!sportMap[sport]) sportMap[sport] = [];
    sportMap[sport].push(b);
  }
  const bySport = Object.entries(sportMap)
    .map(([sport, bets]) => ({ sport, ...calcStats(bets) }))
    .sort((a, b) => b.total - a.total);

  // By EV bucket (ev_percent stored as decimal: 0.021 = 2.1%)
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
  const byEvBucket = ['1-2%', '2-3%', '3-5%']
    .filter(k => bucketMap[k])
    .map(k => ({ evBucket: k, ...calcStats(bucketMap[k]) }));

  // Last 7 days daily summary
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayMap = {};
  for (const b of allBets) {
    if (!b.date || new Date(b.date) < sevenDaysAgo) continue;
    const day = b.date.split('T')[0];
    if (!dayMap[day]) dayMap[day] = { date: day, bets: 0, wins: 0, profitUnits: 0 };
    dayMap[day].bets++;
    if (b.result === 'win') dayMap[day].wins++;
    dayMap[day].profitUnits += b.profit_units || 0;
  }
  const last7Days = Object.values(dayMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({ ...d, profitUnits: Math.round(d.profitUnits * 100) / 100 }));

  // CLV stats
  const withClv      = resolved.filter(b => b.clv != null);
  const avgClv       = withClv.length > 0
    ? withClv.reduce((sum, b) => sum + b.clv, 0) / withClv.length
    : null;
  const positiveRate = withClv.length > 0
    ? (withClv.filter(b => b.clv > 0).length / withClv.length * 100).toFixed(1)
    : null;

  return res.status(200).json({
    overall:     calcStats(resolved),
    byPickType,
    bySport,
    byEvBucket,
    last7Days,
    clvStats:    {
      avgClv:       avgClv != null ? Math.round(avgClv * 10000) / 10000 : null,
      positiveRate,
      sampleSize:   withClv.length,
    },
    pendingCount: pending.length,
  });
}
