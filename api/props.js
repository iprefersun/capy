export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.ODDS_API_KEY;
  const sport = req.query.sport || 'basketball_nba';
  const eventId = req.query.eventId;

  if (!eventId) return res.status(400).json({ error: 'missing eventId' });

  const MARKETS = {
    basketball_nba: 'player_points,player_rebounds,player_assists,player_threes',
    americanfootball_nfl: 'player_pass_tds,player_pass_yards,player_rush_yards,player_receiving_yards',
    baseball_mlb: 'player_hits,player_total_bases,player_rbis',
    icehockey_nhl: 'player_points,player_goals'
  };

  const markets = MARKETS[sport] || 'player_points';
  const primaryMarket = markets.split(',')[0];

  const buildUrl = (mkt) =>
    `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&markets=${mkt}&oddsFormat=american&dateFormat=iso`;

  const tryFetch = async (mkt) => {
    const url = buildUrl(mkt);
    console.log('[Props] Fetching:', url.replace(API_KEY, 'REDACTED'));
    const response = await fetch(url);
    const bodyText = await response.text();
    if (!response.ok) {
      console.error('[Props] API error', response.status, '| body:', bodyText.slice(0, 500));
      return { ok: false, status: response.status, body: bodyText };
    }
    const remaining = response.headers.get('x-requests-remaining');
    if (remaining) console.log('[Props] Credits remaining:', remaining, '| sport:', sport, '| eventId:', eventId);
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      console.error('[Props] JSON parse error:', e.message, '| body:', bodyText.slice(0, 500));
      return { ok: false, status: 500, body: bodyText };
    }
    return { ok: true, data };
  };

  try {
    // Primary attempt with all markets
    let result = await tryFetch(markets);

    // Fallback: retry with just the first market if full request failed or returned no bookmakers
    if (!result.ok || !result.data?.bookmakers?.length) {
      if (markets !== primaryMarket) {
        console.log('[Props] Retrying with fallback market:', primaryMarket);
        result = await tryFetch(primaryMarket);
      }
    }

    if (!result.ok) {
      return res.status(200).json({
        props: [],
        sport,
        eventId,
        count: 0,
        message: `Props API returned error ${result.status} — market may not be available for this game yet`
      });
    }

    const props = result.data?.bookmakers || [];

    if (!props.length) {
      return res.status(200).json({
        props: [],
        sport,
        eventId,
        count: 0,
        message: 'No props available for this game yet'
      });
    }

    return res.status(200).json({
      props,
      sport,
      eventId,
      count: props.length
    });

  } catch (err) {
    console.error('[Props] Unexpected error:', err.message);
    return res.status(200).json({
      props: [],
      sport,
      eventId,
      count: 0,
      message: 'Failed to fetch props — please try again'
    });
  }
}
