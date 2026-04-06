// ─────────────────────────────────────────────────────────────────────────────
// odds.js — Serves cached odds from Supabase odds_cache table.
//
// refresh-odds.js (called by cron every 10 min) is the only place that calls
// The Odds API. This endpoint just reads the cache and returns it, burning
// zero API credits per page load.
//
// Fallback: if the cache is missing or older than 15 minutes, this handler
// fetches directly as a safety net (same as the original behavior).
//
// Response shape: { usOdds, pinnacleOdds, pinnacleMap, fetchedAt, source }
// Existing client-side EV calculation in odds.html is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const ALL_SPORTS = [
  'basketball_nba',
  'americanfootball_nfl',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls',
];

// Cache staleness threshold — if the Supabase row is older than this, fall back
// to a direct API fetch so the user never sees data older than 15 minutes.
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

// ── Direct API fetch (fallback only) ─────────────────────────────────────────
async function fetchSportDirect(sport, API_KEY) {
  const usUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
  const pinnacleUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=h2h&oddsFormat=american&dateFormat=iso`;

  const [usRes, pinnacleRes] = await Promise.all([
    fetch(usUrl),
    fetch(pinnacleUrl).catch(() => null),
  ]);

  const usData = await usRes.json();
  if (!usRes.ok || !Array.isArray(usData)) {
    console.error(`[Odds/fallback] Failed for ${sport}: ${usData?.message || usRes.status}`);
    return { usOdds: [], pinnacleOdds: [], pinnacleMap: {} };
  }

  const remaining = usRes.headers.get('x-requests-remaining');
  if (remaining) console.log('[Odds/fallback] Credits remaining:', remaining);

  let pinnacleOdds = [];
  let pinnacleMap  = {};

  if (pinnacleRes?.ok) {
    try {
      const pData = await pinnacleRes.json();
      if (Array.isArray(pData)) {
        pinnacleOdds = pData;
        // Build pinnacleMap so client can do stale-timestamp check
        for (const pg of pData) {
          const h2h = pg.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h');
          if (!h2h) continue;
          const homeO = h2h.outcomes?.find(o => o.name === pg.home_team);
          const awayO = h2h.outcomes?.find(o => o.name === pg.away_team);
          if (!homeO?.price || !awayO?.price) continue;
          const entry = { homePrice: homeO.price, awayPrice: awayO.price, lastUpdate: h2h.last_update || null };
          pinnacleMap[pg.id] = entry;
          pinnacleMap[`${pg.home_team}|${pg.away_team}`] = entry;
        }
        console.log('[Odds/fallback] Pinnacle fetched:', pData.length, 'games for', sport);
      }
    } catch (e) {
      console.warn('[Odds/fallback] Pinnacle parse error:', e.message);
    }
  }

  return { usOdds: usData, pinnacleOdds, pinnacleMap };
}

export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  const sport   = req.query.sport || 'basketball_nba';

  res.setHeader('Access-Control-Allow-Origin', '*');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    if (sport === 'all') {
      // Fetch all sports from cache in parallel
      const rows = await Promise.all(
        ALL_SPORTS.map(s =>
          supabase.from('odds_cache').select('sport, fetched_at, data').eq('sport', s).single()
        )
      );

      const usOdds      = [];
      const pinnacleOdds = [];
      const pinnacleMap  = {};
      let anyStale = false;

      for (let i = 0; i < ALL_SPORTS.length; i++) {
        const { data: row, error } = rows[i];
        const s = ALL_SPORTS[i];

        if (error || !row) {
          console.warn(`[Odds] Cache miss for ${s} — fetching directly`);
          const direct = await fetchSportDirect(s, API_KEY);
          usOdds.push(...direct.usOdds);
          pinnacleOdds.push(...direct.pinnacleOdds);
          Object.assign(pinnacleMap, direct.pinnacleMap);
          anyStale = true;
          continue;
        }

        const ageMs = Date.now() - new Date(row.fetched_at).getTime();
        if (ageMs > CACHE_MAX_AGE_MS) {
          console.warn(`[Odds] Cache too old (${Math.round(ageMs / 60000)}m) for ${s} — fetching directly`);
          const direct = await fetchSportDirect(s, API_KEY);
          usOdds.push(...direct.usOdds);
          pinnacleOdds.push(...direct.pinnacleOdds);
          Object.assign(pinnacleMap, direct.pinnacleMap);
          anyStale = true;
          continue;
        }

        const d = row.data;
        usOdds.push(...(d.usOdds || []));
        pinnacleOdds.push(...(d.pinnacleOdds || []));
        Object.assign(pinnacleMap, d.pinnacleMap || {});
        console.log(`[Odds] Cache hit for ${s} (${Math.round(ageMs / 60000)}m old, ${d.usOdds?.length || 0} games)`);
      }

      const source = anyStale ? 'direct' : 'cache';
      return res.status(200).json({ usOdds, pinnacleOdds, pinnacleMap, source });
    }

    // ── Single sport ──────────────────────────────────────────────────────────
    const { data: row, error } = await supabase
      .from('odds_cache')
      .select('sport, fetched_at, data')
      .eq('sport', sport)
      .single();

    if (error || !row) {
      console.warn(`[Odds] Cache miss for ${sport} — fetching directly`);
      const direct = await fetchSportDirect(sport, API_KEY);
      return res.status(200).json({ ...direct, source: 'direct' });
    }

    const ageMs = Date.now() - new Date(row.fetched_at).getTime();
    if (ageMs > CACHE_MAX_AGE_MS) {
      console.warn(`[Odds] Cache too old (${Math.round(ageMs / 60000)}m) for ${sport} — fetching directly`);
      const direct = await fetchSportDirect(sport, API_KEY);
      return res.status(200).json({ ...direct, source: 'direct' });
    }

    const d = row.data;
    console.log(`[Odds] Cache hit for ${sport} (${Math.round(ageMs / 60000)}m old, ${d.usOdds?.length || 0} games)`);
    return res.status(200).json({ ...d, source: 'cache' });

  } catch (err) {
    console.error('[Odds] Unexpected error:', err.message);
    // Hard fallback — never leave the user with a broken page
    try {
      const direct = await fetchSportDirect(sport === 'all' ? 'basketball_nba' : sport, API_KEY);
      return res.status(200).json({ ...direct, source: 'fallback' });
    } catch (fallbackErr) {
      console.error('[Odds] Fallback also failed:', fallbackErr.message);
      return res.status(500).json({ error: 'Failed to fetch odds', usOdds: [], pinnacleOdds: [] });
    }
  }
}
