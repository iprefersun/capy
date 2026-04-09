import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: results } = await supabase
    .from('results')
    .select('*, picks(*)')
    .neq('outcome', 'pending')
    .order('recorded_at', { ascending: false });

  if (!results) return res.status(200).json({ picks: [], stats: {} });

  const wins   = results.filter(r => r.outcome === 'win').length;
  const losses = results.filter(r => r.outcome === 'loss').length;
  const pushes = results.filter(r => r.outcome === 'push').length;
  const total  = wins + losses + pushes;
  const winRate = total > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;

  // ROI calculation (flat $100 bet on every pick)
  let roi = 0;
  results.forEach(r => {
    if (r.outcome === 'win') {
      const odds = r.picks?.odds || 0;
      const profit = odds > 0 ? odds : (10000 / Math.abs(odds));
      roi += profit;
    } else if (r.outcome === 'loss') {
      roi -= 100;
    }
  });

  // Average EV at time of pick
  const evValues = results
    .map(r => r.picks?.ev_percent)
    .filter(v => v != null && !isNaN(v));
  const avgEV = evValues.length > 0
    ? (evValues.reduce((a, b) => a + b, 0) / evValues.length).toFixed(1)
    : null;

  const stats = {
    total,
    wins,
    losses,
    pushes,
    winRate,
    roi: roi.toFixed(0),
    roiPercent: total > 0 ? ((roi / (total * 100)) * 100).toFixed(1) : 0,
    avgEV
  };

  res.status(200).json({ picks: results.slice(0, 50), stats });
}
