// Runs all daily jobs sequentially: check-results then generate-content
// Triggered by Vercel cron at 0 14 * * * (2pm UTC / ~10am ET)
// Vercel cron config is in vercel.json: { "path": "/api/daily-jobs", "schedule": "0 14 * * *" }

const BASE_URL = 'https://www.getcapy.co';

module.exports = async (req, res) => {
  const ran = new Date().toISOString();
  console.log('[daily-jobs] Starting daily jobs at', ran);
  const results = {};

  // ── 1. Check results ──────────────────────────────────────────────────
  try {
    console.log('[daily-jobs] Calling check-results...');
    const checkRes = await fetch(`${BASE_URL}/api/check-results`, { method: 'GET' });
    results.checkResults = await checkRes.json();
    console.log('[daily-jobs] check-results response:', JSON.stringify(results.checkResults));
  } catch (err) {
    console.error('[daily-jobs] check-results failed:', err.message);
    results.checkResults = { error: err.message };
  }

  // ── 2. Generate content ───────────────────────────────────────────────
  try {
    console.log('[daily-jobs] Calling generate-content...');
    const contentRes = await fetch(`${BASE_URL}/api/generate-content`, { method: 'GET' });
    results.generateContent = await contentRes.json();
    console.log('[daily-jobs] generate-content response:', JSON.stringify(results.generateContent).slice(0, 200));
  } catch (err) {
    console.error('[daily-jobs] generate-content failed:', err.message);
    results.generateContent = { error: err.message };
  }

  console.log('[daily-jobs] All jobs complete');
  return res.status(200).json({ ran, results });
};
