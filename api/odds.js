const ALL_SPORTS = [
  'basketball_nba',
  'americanfootball_nfl',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls'
];

async function fetchSportOdds(sport, API_KEY) {
  const usUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
  const pinnacleUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=h2h&oddsFormat=american&dateFormat=iso`;

  const [usRes, pinnacleRes] = await Promise.all([
    fetch(usUrl),
    fetch(pinnacleUrl).catch(() => null),
  ]);

  const usData = await usRes.json();
  if (!usRes.ok || !Array.isArray(usData)) {
    console.error(`[Odds] Failed for sport ${sport}: ${usData?.message || usRes.status}`);
    return { usOdds: [], pinnacleOdds: [] };
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

  return { usOdds: usData, pinnacleOdds };
}

export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  const sport = req.query.sport || 'basketball_nba';

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    if (sport === 'all') {
      // Fetch all sports in parallel and combine results
      const results = await Promise.all(ALL_SPORTS.map(s => fetchSportOdds(s, API_KEY)));
      const usOdds = results.flatMap(r => r.usOdds);
      const pinnacleOdds = results.flatMap(r => r.pinnacleOdds);
      console.log('[Odds] sport=all — combined games:', usOdds.length, '| pinnacle:', pinnacleOdds.length);
      return res.status(200).json({ usOdds, pinnacleOdds });
    }

    const { usOdds, pinnacleOdds } = await fetchSportOdds(sport, API_KEY);
    return res.status(200).json({ usOdds, pinnacleOdds });

  } catch (err) {
    console.error('[Odds] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch odds' });
  }
}
