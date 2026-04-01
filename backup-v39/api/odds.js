export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  const sport = req.query.sport || 'basketball_nba';

  const usUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
  const pinnacleUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=h2h&oddsFormat=american&dateFormat=iso`;

  try {
    const [usRes, pinnacleRes] = await Promise.all([
      fetch(usUrl),
      fetch(pinnacleUrl).catch(() => null),
    ]);

    const usData = await usRes.json();
    if (!usRes.ok || !Array.isArray(usData)) {
      return res.status(502).json({ error: usData?.message || 'Unexpected API response' });
    }

    let pinnacleOdds = [];
    if (pinnacleRes?.ok) {
      try {
        const pData = await pinnacleRes.json();
        if (Array.isArray(pData)) {
          pinnacleOdds = pData;
          const remaining = pinnacleRes.headers.get('x-requests-remaining');
          if (remaining) console.log('[Pinnacle] Credits remaining:', remaining);
          console.log('[Pinnacle] Games fetched:', pData.length, 'for sport:', sport);
        }
      } catch (e) {
        console.log('[Pinnacle] Parse error:', e.message);
      }
    } else {
      console.log('[Pinnacle] No data returned for sport:', sport, '| status:', pinnacleRes?.status);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ usOdds: usData, pinnacleOdds });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch odds' });
  }
}
