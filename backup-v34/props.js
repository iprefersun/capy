export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  const sport = req.query.sport || 'basketball_nba';
  const eventId = req.query.eventId;

  if (!eventId) return res.status(400).json({ error: 'missing eventId' });

  const markets = sport === 'basketball_nba'
    ? 'player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals'
    : sport === 'americanfootball_nfl'
    ? 'player_pass_tds,player_pass_yards,player_rush_yards,player_reception_yards,player_receptions'
    : sport === 'baseball_mlb'
    ? 'player_hits,player_home_runs,player_rbis,player_strikeouts_thrown'
    : sport === 'icehockey_nhl'
    ? 'player_points,player_goals,player_assists'
    : 'player_points';

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&markets=${markets}&oddsFormat=american&dateFormat=iso`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data?.message || 'API error' });

    // Log remaining credits so owner can monitor usage
    const remaining = response.headers.get('x-requests-remaining');
    if (remaining) console.log('[Props] Credits remaining after fetch:', remaining, '| sport:', sport, '| eventId:', eventId);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch props' });
  }
}
