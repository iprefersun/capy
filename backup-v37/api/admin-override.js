import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Simple admin password check
  const { password, pick_id, outcome, action } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  if (action === 'delete') {
    const { error } = await supabase.from('picks').delete().eq('id', pick_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (action === 'override' && outcome) {
    const validOutcomes = ['win', 'loss', 'push'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome' });
    }

    const { error } = await supabase.from('results').upsert({
      pick_id,
      outcome,
      recorded_at: new Date().toISOString(),
      manual_override: true
    }, { onConflict: 'pick_id' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(400).json({ error: 'Invalid action' });
}
