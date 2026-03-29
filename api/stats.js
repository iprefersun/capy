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

    // DEBUG: return raw responses to inspect API shape
    return res.status(200).json({ teamsResponse: teamsData, playersResponse: playersData });
  } catch (err) {
    console.error('[stats] error:', err.message, err.stack);
    res.status(200).json([]);
  }
}
