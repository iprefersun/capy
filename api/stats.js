export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const teamName = req.query.team;
  if (!teamName) return res.status(400).json([]);

  const headers = { Authorization: `Bearer ${process.env.BALLDONTLIE_API_KEY}` };

  try {
    // 1. Find team id
    const teamsRes = await fetch('https://api.balldontlie.io/v1/teams', { headers });
    if (!teamsRes.ok) return res.status(200).json([]);
    const teamsData = await teamsRes.json();

    const needle = teamName.toLowerCase();
    const team = teamsData.data?.find(t =>
      t.full_name?.toLowerCase().includes(needle) ||
      t.name?.toLowerCase().includes(needle) ||
      t.city?.toLowerCase().includes(needle)
    );
    console.log('[stats] team search:', team ? `found ${team.full_name} (id=${team.id})` : `no match for "${teamName}"`);
    if (!team) return res.status(200).json([]);

    // 2. Fetch players for that team
    const playersRes = await fetch(
      `https://api.balldontlie.io/v1/players?team_ids[]=${team.id}&per_page=100`,
      { headers }
    );
    if (!playersRes.ok) return res.status(200).json([]);
    const playersData = await playersRes.json();

    const players = playersData.data || [];
    console.log('[stats] players fetched:', players.length);
    if (!players.length) return res.status(200).json([]);

    // 3. Fetch season averages for all players in one request
    const ids = players.map(p => p.id);
    const params = ids.map(id => `player_ids[]=${id}`).join('&');
    const avgRes = await fetch(
      `https://api.balldontlie.io/v1/season_averages?season=2024&${params}`,
      { headers }
    );
    if (!avgRes.ok) return res.status(200).json([]);
    const avgData = await avgRes.json();

    const avgMap = {};
    for (const avg of (avgData.data || [])) {
      avgMap[avg.player_id] = avg;
    }

    // 4. Combine and return
    const result = players
      .map(p => {
        const avg = avgMap[p.id] || {};
        return {
          name: `${p.first_name} ${p.last_name}`,
          position: p.position || '—',
          pts: avg.pts ?? null,
          reb: avg.reb ?? null,
          ast: avg.ast ?? null,
          fgPct: avg.fg_pct ?? null,
        };
      })
      .filter(p => p.pts !== null) // only players with stats this season
      .sort((a, b) => b.pts - a.pts);

    res.status(200).json(result);
  } catch (err) {
    console.error('[stats] error:', err.message, err.stack);
    res.status(200).json([]);
  }
}
