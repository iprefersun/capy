import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { picks } = req.body;
  if (!picks || !Array.isArray(picks)) return res.status(400).json({ error: 'Invalid picks data' });

  // Only save picks we haven't saved today (check by game_id)
  const gameIds = picks.map(p => p.game_id);
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await supabase
    .from('picks')
    .select('game_id')
    .in('game_id', gameIds)
    .gte('created_at', today);

  const existingIds = (existing || []).map(e => e.game_id);
  const newPicks = picks
    .filter(p => !existingIds.includes(p.game_id))
    .map(p => {
      let ev = p.ev_percent;
      if (ev != null) {
        // Correct scale: sometimes 315.7 is passed instead of 3.157
        if (Math.abs(ev) > 100) {
          console.warn(`[save-picks] EV out of scale (${ev}) for game_id ${p.game_id} — dividing by 100`);
          ev = ev / 100;
        }
        // Reject values outside the realistic range after correction
        if (ev < -50 || ev > 30) {
          console.warn(`[save-picks] EV out of range (${ev}) after correction for game_id ${p.game_id} — setting to null`);
          ev = null;
        }
      }
      return { ...p, ev_percent: ev };
    });

  if (newPicks.length === 0) return res.status(200).json({ message: 'No new picks to save' });

  const { data, error } = await supabase.from('picks').insert(newPicks);
  if (error) return res.status(500).json({ error: error.message });

  console.log(`[save-picks] Saved ${newPicks.length} new picks`);
  res.status(200).json({ saved: newPicks.length, data });
}
