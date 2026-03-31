// odds api updated
export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  const sport = req.query.sport || 'basketball_nba';

  // ── TEST: Pinnacle via EU region ──────────────────────────────────────
  try {
    const pinnacleUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=h2h&oddsFormat=american&dateFormat=iso`;
    const pinnacleRes = await fetch(pinnacleUrl);
    const pinnacleData = await pinnacleRes.json();
    console.log('[Pinnacle test] status:', pinnacleRes.status);
    console.log('[Pinnacle test] response:', JSON.stringify(pinnacleData).slice(0, 2000));
  } catch (err) {
    console.log('[Pinnacle test] fetch error:', err.message);
  }
  // ── END TEST ─────────────────────────────────────────────────────────

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) {
      return res.status(502).json({ error: data?.message || 'Unexpected API response' });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch odds' });
  }
}
