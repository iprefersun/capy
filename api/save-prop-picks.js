// ─────────────────────────────────────────────────────────────────────────────
// save-prop-picks.js — Daily cron: scan NBA and MLB props for EV+ opportunities
// vs Pinnacle and save up to PROP_MAX_DAILY qualifying picks to the prop_picks table.
//
// Triggered by Vercel cron — see vercel.json for schedule.
//
// Data flow:
//   1. Read upcoming NBA/MLB events from odds_cache (no API credits burned).
//   2. For each event in the 2–30h window, fetch US book props + Pinnacle EU
//      props directly from The Odds API (credits used here).
//   3. For each player outcome with a matching Pinnacle line, calculate no-vig
//      EV. Qualifying threshold: ≥ PROP_EV_MIN percent vs Pinnacle.
//   4. Dedup against existing prop_picks by (player_name, market_type, line, over_under, game_time, book).
//   5. Sort by EV descending, cap at PROP_MAX_DAILY, insert into prop_picks table.
//
// Writes only to prop_picks. Does NOT write to bets or picks tables.
//
// Required env: ODDS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

// ── Constants ──────────────────────────────────────────────────────────────────
const PROP_SPORTS = ['basketball_nba', 'baseball_mlb'];

const PROP_SPORT_MARKETS = {
  // batter_hits removed — Pinnacle does not reliably post lines for hits, wasting API credits
  basketball_nba: ['player_points', 'player_rebounds', 'player_assists', 'player_steals', 'player_blocks'],
  baseball_mlb:   ['pitcher_strikeouts', 'batter_home_runs'],
};

// Human-readable market names used in the pick label
const MARKET_DISPLAY = {
  player_points:      'Points',
  player_rebounds:    'Rebounds',
  player_assists:     'Assists',
  player_steals:      'Steals',
  player_blocks:      'Blocks',
  pitcher_strikeouts: 'Strikeouts',
  batter_home_runs:   'Home Runs',
};

// Normalized stat_type value stored in the bets table — used for display in record.html
const STAT_TYPE = {
  player_points:      'points',
  player_rebounds:    'rebounds',
  player_assists:     'assists',
  player_steals:      'steals',
  player_blocks:      'blocks',
  pitcher_strikeouts: 'strikeouts',
  batter_home_runs:   'home_runs',
};

const PROP_EV_MIN    = 2.0;   // minimum EV% to qualify vs Pinnacle
const PROP_MAX_DAILY = 5;     // max prop picks saved per day total
const PROP_STAKE     = 0.5;   // half-unit stake per prop pick

const US_BOOKS = 'fanduel,draftkings,betmgm,betrivers,betonlineag,caesars';

// ── EV helpers ─────────────────────────────────────────────────────────────────
function amToDecimal(american) {
  if (american == null || isNaN(american)) return null;
  return american > 0 ? (american / 100) + 1 : (100 / Math.abs(american)) + 1;
}

function amToImpliedProb(american) {
  if (american > 0) return 100 / (american + 100);
  return Math.abs(american) / (Math.abs(american) + 100);
}

// No-vig EV for a prop outcome vs Pinnacle's Over/Under line.
// pinOverOdds / pinUnderOdds: American integers.
// side: 'Over' or 'Under'.
// Returns { ev (percentage, e.g. 3.2), fairProb } or null if inputs are invalid.
function calcPropEV(bookOdds, pinOverOdds, pinUnderOdds, side) {
  if (bookOdds == null || pinOverOdds == null || pinUnderOdds == null) return null;

  const impOver  = amToImpliedProb(pinOverOdds);
  const impUnder = amToImpliedProb(pinUnderOdds);
  const total    = impOver + impUnder;

  // Pinnacle prop vig is typically 2–6%. Reject anything outside that sanity band.
  if (total < 0.98 || total > 1.15) return null;

  const fairProb = side === 'Over' ? impOver / total : impUnder / total;
  const decimal  = amToDecimal(bookOdds);
  if (!decimal) return null;

  const ev = parseFloat(((fairProb * decimal - 1) * 100).toFixed(2));
  return { ev, fairProb };
}

// ── Fetch props for one event ──────────────────────────────────────────────────
async function fetchEventProps(sport, eventId, markets, API_KEY) {
  const mktParam = markets.join(',');
  const usUrl    = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&bookmakers=${US_BOOKS}&markets=${mktParam}&oddsFormat=american&dateFormat=iso`;
  const pinUrl   = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=${mktParam}&oddsFormat=american&dateFormat=iso`;

  const safeFetch = async (url, label) => {
    const redacted = url.replace(API_KEY, 'REDACTED');
    console.log(`[PropPicks/${label}] Fetching ${redacted}`);
    try {
      const r    = await fetch(url);
      const body = await r.text();
      if (!r.ok) {
        console.error(`[PropPicks/${label}] API error ${r.status} for ${eventId}: ${body.slice(0, 200)}`);
        return null;
      }
      const rem = r.headers.get('x-requests-remaining');
      if (rem) console.log(`[PropPicks] Credits remaining: ${rem}`);
      return JSON.parse(body);
    } catch (err) {
      console.error(`[PropPicks/${label}] Fetch threw for ${eventId}:`, err.message);
      return null;
    }
  };

  const [usData, pinData] = await Promise.all([
    safeFetch(usUrl, 'US'),
    safeFetch(pinUrl, 'Pinnacle'),
  ]);

  return { usData, pinData };
}

// ── Scan one event's props data for EV+ outcomes ───────────────────────────────
// Returns an array of candidate objects ready to evaluate.
function scanPropsForEV(usData, pinData, sport, gameTime) {
  if (!usData || !pinData) return [];

  const usBookmakers  = usData.bookmakers  || [];
  const pinBookmakers = pinData.bookmakers || [];

  if (!usBookmakers.length || !pinBookmakers.length) return [];

  // Build Pinnacle map: marketKey → playerName → side → { price, point }
  const pinMap = {};
  for (const bm of pinBookmakers) {
    for (const mkt of (bm.markets || [])) {
      if (!pinMap[mkt.key]) pinMap[mkt.key] = {};
      for (const o of (mkt.outcomes || [])) {
        if (!o.name || !o.description || o.price == null || o.point == null) continue;
        if (!pinMap[mkt.key][o.name]) pinMap[mkt.key][o.name] = {};
        pinMap[mkt.key][o.name][o.description] = { price: o.price, point: o.point };
      }
    }
  }

  // Build best US price map: marketKey → playerName → side → { price, book, point }
  const bestMap = {};
  for (const bm of usBookmakers) {
    for (const mkt of (bm.markets || [])) {
      if (!bestMap[mkt.key]) bestMap[mkt.key] = {};
      for (const o of (mkt.outcomes || [])) {
        if (!o.name || !o.description || o.price == null || o.point == null) continue;
        if (!bestMap[mkt.key][o.name]) bestMap[mkt.key][o.name] = {};
        const current = bestMap[mkt.key][o.name][o.description];
        if (!current || o.price > current.price) {
          bestMap[mkt.key][o.name][o.description] = { price: o.price, book: bm.key, point: o.point };
        }
      }
    }
  }

  const candidates = [];

  for (const [marketKey, players] of Object.entries(bestMap)) {
    const pinMkt     = pinMap[marketKey];
    if (!pinMkt) continue;

    const marketName = MARKET_DISPLAY[marketKey] || marketKey;

    for (const [playerName, sides] of Object.entries(players)) {
      const pinPlayer = pinMkt[playerName];
      // Both sides of the Pinnacle line are required for a valid no-vig calculation
      if (!pinPlayer?.Over?.price || !pinPlayer?.Under?.price) continue;

      const pinOverOdds  = pinPlayer.Over.price;
      const pinUnderOdds = pinPlayer.Under.price;

      for (const side of ['Over', 'Under']) {
        const best    = sides[side];
        const pinSide = pinPlayer[side];
        if (!best || !pinSide) continue;

        // Line must match — different points means a different bet, not a mispricing
        if (best.point !== pinSide.point) continue;

        const result = calcPropEV(best.price, pinOverOdds, pinUnderOdds, side);
        if (!result || result.ev < PROP_EV_MIN) continue;

        const { ev, fairProb } = result;

        // CLV at save time: placed decimal vs Pinnacle decimal for the same side
        const decimalOdds     = amToDecimal(best.price);
        const pinnacleDecimal = amToDecimal(pinSide.price);
        const clvAtSave = (decimalOdds && pinnacleDecimal)
          ? Math.round(((decimalOdds - pinnacleDecimal) / pinnacleDecimal) * 10000) / 10000
          : null;

        // Pick label format: "Luka Doncic - Points Over 28.5"
        const pickLabel = `${playerName} - ${marketName} ${side} ${best.point}`;

        candidates.push({
          pick:               pickLabel,
          sport,
          book:               best.book,
          odds_placed:        best.price,
          ev_pct:             ev,                // raw % for sorting/logging
          ev_percent:         ev / 100,          // decimal stored in prop_picks (0.031 = 3.1%)
          pinnacle_odds:      pinSide.price,     // Pinnacle odds for the taken side
          pinnacle_away_odds: side === 'Over' ? pinUnderOdds : pinOverOdds,
          game_time:          gameTime,
          true_probability:   fairProb,
          decimal_odds:       decimalOdds,
          clv:                clvAtSave,
          // Structured prop fields
          player_name:        playerName,
          market_type:        marketKey,         // raw API key, e.g. 'player_points'
          stat_type:          STAT_TYPE[marketKey] || marketKey,
          line:               best.point,
          over_under:         side.toLowerCase(),  // 'over' or 'under'
        });
      }
    }
  }

  return candidates;
}

// ── Handler ────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    console.error('[PropPicks] ODDS_API_KEY not set');
    return res.status(500).json({ error: 'ODDS_API_KEY not configured' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const now   = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // ── Step 1: Check today's existing prop picks ──────────────────────────────
  // Look back 7 days so a pick can't sneak through on a day boundary edge case.
  const sevenDaysAgoISO = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: recentProps, error: countErr } = await supabase
    .from('prop_picks')
    .select('player_name, market_type, line, over_under, game_time, book, picked_at')
    .eq('archived', false)
    .gte('picked_at', sevenDaysAgoISO);

  if (countErr) {
    console.error('[PropPicks] Error checking existing picks:', countErr.message);
    return res.status(500).json({ error: 'DB error checking existing picks' });
  }

  // Build dedup set by structural uniqueness (player, market, line, side, game, book)
  const existingKeys = new Set((recentProps || []).map(p =>
    `${p.player_name}|${p.market_type}|${p.line}|${p.over_under}|${(p.game_time || '').slice(0, 16)}|${p.book}`
  ));
  // Picks saved today (UTC) count against the daily cap
  const todayCount = (recentProps || []).filter(p =>
    p.picked_at && p.picked_at.startsWith(today)
  ).length;
  const slotsLeft  = PROP_MAX_DAILY - todayCount;

  if (slotsLeft <= 0) {
    console.log(`[PropPicks] Daily limit reached (${todayCount}/${PROP_MAX_DAILY}) — skipping`);
    return res.status(200).json({ message: 'Daily prop pick limit reached', saved: 0 });
  }

  console.log(`[PropPicks] ${todayCount}/${PROP_MAX_DAILY} prop picks in prop_picks today — ${slotsLeft} slots remaining`);

  // ── Step 2: Get upcoming NBA/MLB events from odds_cache ────────────────────
  const { data: cachedOdds, error: cacheErr } = await supabase
    .from('odds_cache')
    .select('sport, data')
    .in('sport', PROP_SPORTS);

  if (cacheErr || !cachedOdds?.length) {
    console.error('[PropPicks] Failed to read odds_cache:', cacheErr?.message ?? 'no rows');
    return res.status(200).json({ message: 'No odds cache data available', saved: 0 });
  }

  // Collect events in the 2–30h window
  const events = [];
  for (const row of cachedOdds) {
    const { sport, data } = row;
    for (const game of (data?.usOdds || [])) {
      if (!game.id || !game.commence_time) continue;
      const hoursToGame = (new Date(game.commence_time).getTime() - now) / 3_600_000;
      // Skip games already underway or starting in < 2h (lines likely frozen/removed)
      // Skip games > 30h out (props often not yet posted)
      if (hoursToGame < 2 || hoursToGame > 30) continue;
      events.push({ sport, eventId: game.id, gameTime: game.commence_time,
                    homeTeam: game.home_team, awayTeam: game.away_team });
    }
  }

  if (!events.length) {
    console.log('[PropPicks] No qualifying games in 2–30h window');
    return res.status(200).json({ message: 'No qualifying games in time window', saved: 0 });
  }

  console.log(`[PropPicks] Scanning ${events.length} events for prop EV+ (≥${PROP_EV_MIN}% vs Pinnacle)`);

  // ── Step 3: Fetch props for each event and scan for EV+ ───────────────────
  // Fetched sequentially — parallel would burst API rate limits on large slates.
  const allCandidates = [];

  for (const { sport, eventId, gameTime, homeTeam, awayTeam } of events) {
    const markets = PROP_SPORT_MARKETS[sport];
    try {
      const { usData, pinData } = await fetchEventProps(sport, eventId, markets, API_KEY);
      const candidates = scanPropsForEV(usData, pinData, sport, gameTime);
      if (candidates.length) {
        console.log(`[PropPicks] ${eventId}: ${candidates.length} candidates found`);
      }
      const matchup = (homeTeam && awayTeam) ? `${awayTeam} @ ${homeTeam}` : null;
      candidates.forEach(c => { c.eventId = eventId; c.matchup = matchup; });
      allCandidates.push(...candidates);
    } catch (err) {
      // A single event failure must not abort the whole run
      console.error(`[PropPicks] Error scanning ${eventId}:`, err.message);
    }
  }

  if (!allCandidates.length) {
    console.log('[PropPicks] No prop candidates met the EV threshold');
    return res.status(200).json({ message: 'No qualifying prop picks found', saved: 0 });
  }

  console.log(`[PropPicks] ${allCandidates.length} total candidates at ≥${PROP_EV_MIN}% EV before dedup`);

  // ── Step 4: Dedup + cap ────────────────────────────────────────────────────
  const deduped = allCandidates.filter(c => {
    const key = `${c.player_name}|${c.market_type}|${c.line}|${c.over_under}|${(c.game_time || '').slice(0, 16)}|${c.book}`;
    return !existingKeys.has(key);
  });

  if (!deduped.length) {
    console.log('[PropPicks] All candidates already saved — nothing new');
    return res.status(200).json({ message: 'All candidates already saved', saved: 0 });
  }

  // Sort by EV descending, take only the open slots
  deduped.sort((a, b) => b.ev_pct - a.ev_pct);
  const selected = deduped.slice(0, slotsLeft);

  console.log(`[PropPicks] Saving ${selected.length} prop picks:`);
  selected.forEach(p => {
    console.log(`  → ${p.pick} | EV: ${p.ev_pct.toFixed(2)}% | odds: ${p.odds_placed} | book: ${p.book}`);
  });

  // ── Step 5: Build prop_picks rows and insert ───────────────────────────────
  const now2 = new Date().toISOString();
  const propRows = selected.map(p => ({
    picked_at:              now2,
    observed_at:            now2,
    sport:                  p.sport,
    event_id:               p.eventId ?? null,
    game_time:              p.game_time,
    matchup:                p.matchup ?? null,
    player_name:            p.player_name,
    market_type:            p.market_type,
    stat_type:              p.stat_type,
    line:                   p.line,
    over_under:             p.over_under,
    pick:                   p.pick,
    book:                   p.book,
    odds_placed:            p.odds_placed,
    decimal_odds:           p.decimal_odds,
    sharp_book:             'pinnacle',
    pinnacle_odds:          p.pinnacle_odds,
    pinnacle_odds_opposing: p.pinnacle_away_odds,
    fair_probability:       p.true_probability ?? null,
    ev_percent:             p.ev_percent,
    clv_at_save:            p.clv,
    source_page:            'save-prop-picks-cron',
    is_playable:            true,
    official_pick:          false,
    stake_units:            PROP_STAKE,
    result:                 'pending',
    archived:               false,
  }));

  const { error: insertErr } = await supabase.from('prop_picks').insert(propRows);
  if (insertErr) {
    console.error('[PropPicks] Insert error:', insertErr.message);
    return res.status(500).json({ error: insertErr.message });
  }

  console.log(`[PropPicks] Successfully saved ${propRows.length} prop picks to prop_picks`);

  return res.status(200).json({
    saved: propRows.length,
    picks: propRows.map(p => p.pick),
  });
}
