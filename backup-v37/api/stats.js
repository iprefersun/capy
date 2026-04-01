// v3 — returns shaped { players } object
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const teamName = req.query.team;
  if (!teamName) return res.status(400).json({ error: 'missing team param' });

  const headers = { Authorization: `Bearer ${process.env.BALLDONTLIE_API_KEY}` };

  try {
    // 1. Find team ID
    const teamsRes = await fetch('https://api.balldontlie.io/v1/teams?per_page=100', { headers });
    const teamsData = await teamsRes.json();

    const needle = teamName.toLowerCase();
    const team = teamsData.data?.find(t =>
      t.full_name?.toLowerCase().includes(needle) ||
      t.name?.toLowerCase().includes(needle)
    );
    if (!team) return res.status(200).json({ players: [] });

    // 2. Fetch players for that team
    const playersRes = await fetch(
      `https://api.balldontlie.io/v1/players?team_ids[]=${team.id}&per_page=100`,
      { headers }
    );
    const playersData = await playersRes.json();

    const ids = (playersData.data || []).slice(0, 25).map(p => p.id);
    const playerMap = {};
    (playersData.data || []).forEach(p => { playerMap[p.id] = p; });

    if (!ids.length) return res.status(200).json({ players: [] });

    // 3. Fetch season averages (2024 = 2024-25 NBA season)
    const avgUrl = `https://api.balldontlie.io/v1/season_averages?season=2024&${ids.map(id => `player_ids[]=${id}`).join('&')}`;
    const avgRes = await fetch(avgUrl, { headers });
    const avgData = await avgRes.json();

    // 4. Shape: top 8 players by pts, each with name/position/pts/reb/ast
    const players = (avgData.data || [])
      .filter(a => a.pts != null && a.pts > 0)
      .sort((a, b) => (b.pts || 0) - (a.pts || 0))
      .slice(0, 8)
      .map(a => {
        const p = playerMap[a.player_id] || {};
        return {
          name: p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : null,
          position: p.position || null,
          pts: a.pts != null ? parseFloat(a.pts.toFixed(1)) : null,
          reb: a.reb != null ? parseFloat(a.reb.toFixed(1)) : null,
          ast: a.ast != null ? parseFloat(a.ast.toFixed(1)) : null,
        };
      })
      .filter(p => p.name);

    return res.status(200).json({ players });
  } catch (err) {
    console.error('[stats] error:', err.message);
    return res.status(500).json({ error: err.message, players: [] });
  }
}
