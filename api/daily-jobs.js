// Runs all daily jobs sequentially: check-results then generate-content
// Triggered by Vercel cron at 0 14 * * * (2pm UTC / ~10am ET)

const BASE_URL = 'https://www.getcapy.co';

module.exports = async (req, res) => {
  const results = {};

  // ── 1. Check results ──────────────────────────────────────────────────
  try {
    const checkRes = await fetch(`${BASE_URL}/api/check-results`, { method: 'GET' });
    results.checkResults = await checkRes.json();
  } catch (err) {
    results.checkResults = { error: err.message };
  }

  // ── 2. Generate content ───────────────────────────────────────────────
  try {
    const contentRes = await fetch(`${BASE_URL}/api/generate-content`, { method: 'GET' });
    results.generateContent = await contentRes.json();
  } catch (err) {
    results.generateContent = { error: err.message };
  }

  return res.status(200).json({
    ran: new Date().toISOString(),
    results
  });
};
