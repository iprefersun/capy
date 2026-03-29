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

    // Build a lookup map from player id -> player object
    const playerMap = {};
    for (const p of players) playerMap[p.id] = p;

    // 3. Batch player IDs into groups of 25 and fetch season averages
    const ids = players.map(p => p.id);
    const batches = [];
    for (let i = 0; i < ids.length; i += 25) batches.push(ids.slice(i, i + 25));

    const avgMap = {};
    await Promise.all(batches.map(async batch => {
      const params = batch.map(id => `player_ids[]=${id}`).join('&');
      const avgRes = await fetch(
        `https://api.balldontlie.io/v1/season_averages?season=2024&${params}`,
        { headers }
      );
      if (!avgRes.ok) return;
      const avgData = await avgRes.json();
      for (const avg of (avgData.data || [])) avgMap[avg.player_id] = avg;
    }));

    console.log('[stats] season averages found:', Object.keys(avgMap).length);

    // 4. Combine, filter to players with actual stats, sort by pts
    const result = players
      .filter(p => {
        const avg = avgMap[p.id];
        return avg && avg.pts != null && avg.reb != null && avg.ast != null;
      })
      .map(p => {
        const avg = avgMap[p.id];
        return {
          name: `${p.first_name} ${p.last_name}`,
          position: p.position || '—',
          pts: avg.pts,
          reb: avg.reb,
          ast: avg.ast,
          fgPct: avg.fg_pct ?? null,
        };
      })
      .sort((a, b) => b.pts - a.pts);

    res.status(200).json(result);
  } catch (err) {
    console.error('[stats] error:', err.message, err.stack);
    res.status(200).json([]);
  }
}
