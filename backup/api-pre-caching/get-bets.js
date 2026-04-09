import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // ── Query parameters ──────────────────────────────────────────────────────
  const { sport, result, pick_type, days } = req.query;

  let query = supabase
    .from('bets')
    .select('*')
    .eq('archived', false)
    .order('date', { ascending: false })
    .limit(500);

  if (sport && sport !== 'all') query = query.eq('sport', sport);
  if (result && result !== 'all') query = query.eq('result', result);
  if (pick_type && pick_type !== 'all') query = query.eq('pick_type', pick_type);
  if (days && days !== 'all') {
    const cutoff = new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    query = query.gte('date', cutoff);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[get-bets] Supabase error:', error.message);
    return res.status(500).json({ error: error.message, bets: [] });
  }

  return res.status(200).json({ bets: data || [] });
}
