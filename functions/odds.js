exports.handler = async function(event, context) {
  const API_KEY = process.env.ODDS_API_KEY;
  const sport = event.queryStringParameters?.sport || 'americanfootball_nfl';
  
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads&oddsFormat=american&dateFormat=iso`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch odds' })
    };
  }
};
