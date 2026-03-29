// v2
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const teamName = req.query.team;
  if (!teamName) return res.status(400).json({ error: 'missing team param' });

  const headers = { Authorization: `Bearer ${process.env.BALLDONTLIE_API_KEY}` };

  try {
    // 1. Find team ID
    const teamsRes = await fetch('https://api.balldontlie.io/v1/teams?per_page=100', { headers });
    const teamsData = await teamsRes.json();
    console.log('[stats] teams status:', teamsRes.status, 'count:', teamsData.data?.length);

    const needle = teamName.toLowerCase();
    const team = teamsData.data?.find(t =>
      t.full_name?.toLowerCase().includes(needle) ||
      t.name?.toLowerCase().includes(needle)
    );
    console.log('[stats] team match:', team ? `${team.full_name} id=${team.id}` : 'none');
    if (!team) return res.status(200).json({ error: 'team not found', needle });

    // 2. Fetch players for that team
    const playersRes = await fetch(
      `https://api.balldontlie.io/v1/players?team_ids[]=${team.id}&per_page=100`,
      { headers }
    );
    const playersData = await playersRes.json();
    console.log('[stats] players status:', playersRes.status, 'count:', playersData.data?.length);

    const ids = (playersData.data || []).slice(0, 25).map(p => p.id);
    console.log('[stats] first 25 player ids:', ids);

    // 3. Fetch season averages for first 25 players
    const avgUrl = `https://api.balldontlie.io/v1/season_averages?season=2024&${ids.map(id => `player_ids[]=${id}`).join('&')}`;
    console.log('[stats] avg url:', avgUrl);

    const avgRes = await fetch(avgUrl, { headers });
    const avgData = await avgRes.json();
    console.log('[stats] avg status:', avgRes.status, 'count:', avgData.data?.length);

    // 4. Return raw response for inspection
    return res.status(200).json(avgData);
  } catch (err) {
    console.error('[stats] error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
