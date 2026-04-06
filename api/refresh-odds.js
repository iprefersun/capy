// ─────────────────────────────────────────────────────────────────────────────
// refresh-odds.js — Called by Vercel cron every 10 minutes.
// Fetches moneyline odds (US books + Pinnacle EU) for all active sports and
// upserts the result into the odds_cache Supabase table.
//
// odds.js reads from this cache instead of calling The Odds API directly,
// so user-facing requests burn zero API credits.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const ALL_SPORTS = [
  'basketball_nba',
  'americanfootball_nfl',
  'baseball_mlb',
  'icehockey_nhl',
  'soccer_usa_mls',
];

// No-vig EV pre-calculation (mirrors client-side logic — stored alongside raw
// data so the client can show EV immediately on first paint without re-computing).
function amToImpliedProb(american) {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

function calculateEV(bookOdds, pinnacleHomeOdds, pinnacleAwayOdds, isHome) {
  if (bookOdds == null || pinnacleHomeOdds == null || pinnacleAwayOdds == null) return null;
  const impH = amToImpliedProb(pinnacleHomeOdds);
  const impA = amToImpliedProb(pinnacleAwayOdds);
  const total = impH + impA;
  if (total <= 0 || total < 0.9 || total > 1.2) return null;
  const fairProb = isHome ? impH / total : impA / total;
  const decimal  = bookOdds > 0 ? 1 + bookOdds / 100 : 1 + 100 / Math.abs(bookOdds);
  const ev       = parseFloat(((fairProb * decimal - 1) * 100).toFixed(2));
  return { ev, fairProb };
}

async function fetchSportData(sport, API_KEY) {
  // Moneylines only — we never show EV on spreads/totals, no point fetching them here.
  const usUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
  // Also fetch spreads and totals for the odds comparison table (no EV calculated)
  const usFullUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
  const pinnacleUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=h2h&oddsFormat=american&dateFormat=iso`;

  const [usRes, pinnacleRes] = await Promise.all([
    fetch(usFullUrl),
    fetch(pinnacleUrl).catch(() => null),
  ]);

  const usData = await usRes.json();
  if (!usRes.ok || !Array.isArray(usData)) {
    console.error(`[refresh-odds] US odds failed for ${sport}: ${usData?.message || usRes.status}`);
    return null;
  }

  const remaining = usRes.headers.get('x-requests-remaining');
  if (remaining) console.log(`[refresh-odds] API credits remaining after ${sport}: ${remaining}`);

  let pinnacleOdds = [];
  if (pinnacleRes?.ok) {
    try {
      const pData = await pinnacleRes.json();
      if (Array.isArray(pData)) {
        pinnacleOdds = pData;
        console.log(`[refresh-odds] Pinnacle: ${pData.length} games for ${sport}`);
      }
    } catch (e) {
      console.warn(`[refresh-odds] Pinnacle parse error for ${sport}:`, e.message);
    }
  }

  // Build a lookup map: game.id → Pinnacle h2h prices + last_update
  const pinnacleMap = {};
  for (const pg of pinnacleOdds) {
    const h2h = pg.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h');
    if (!h2h) continue;
    const homeO = h2h.outcomes?.find(o => o.name === pg.home_team);
    const awayO = h2h.outcomes?.find(o => o.name === pg.away_team);
    if (!homeO?.price || !awayO?.price) continue;
    pinnacleMap[pg.id] = {
      homePrice:   homeO.price,
      awayPrice:   awayO.price,
      lastUpdate:  h2h.last_update || null,
    };
    pinnacleMap[`${pg.home_team}|${pg.away_team}`] = pinnacleMap[pg.id];
  }

  return {
    usOdds:      usData,
    pinnacleOdds,
    pinnacleMap,  // keyed by game.id and "home|away" — used for stale timestamp check
    fetchedAt:   new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  // Allow both GET (cron) and POST (manual trigger from admin)
  res.setHeader('Access-Control-Allow-Origin', '*');

  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    console.error('[refresh-odds] ODDS_API_KEY not set');
    return res.status(500).json({ error: 'ODDS_API_KEY not configured' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const results = { updated: [], failed: [], skipped: [] };

  for (const sport of ALL_SPORTS) {
    try {
      console.log(`[refresh-odds] Fetching ${sport}...`);
      const data = await fetchSportData(sport, API_KEY);

      if (!data) {
        results.failed.push(sport);
        continue;
      }

      const usGames = data.usOdds.filter(g => g?.bookmakers?.length);
      if (!usGames.length) {
        console.log(`[refresh-odds] No games for ${sport} — skipping upsert`);
        results.skipped.push(sport);
        continue;
      }

      const payload = {
        sport,
        fetched_at: data.fetchedAt,
        data: {
          usOdds:      usGames,
          pinnacleOdds: data.pinnacleOdds,
          pinnacleMap:  data.pinnacleMap,
          fetchedAt:    data.fetchedAt,
        },
      };

      const { error } = await supabase
        .from('odds_cache')
        .upsert(payload, { onConflict: 'sport' });

      if (error) {
        console.error(`[refresh-odds] Supabase upsert failed for ${sport}:`, error.message);
        results.failed.push(sport);
      } else {
        console.log(`[refresh-odds] Cached ${usGames.length} games for ${sport}`);
        results.updated.push(sport);
      }
    } catch (err) {
      console.error(`[refresh-odds] Unexpected error for ${sport}:`, err.message);
      results.failed.push(sport);
    }
  }

  console.log('[refresh-odds] Done —', JSON.stringify(results));
  return res.status(200).json({ ...results, timestamp: new Date().toISOString() });
}
