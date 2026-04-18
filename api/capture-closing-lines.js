// ─────────────────────────────────────────────────────────────────────────────
// capture-closing-lines.js — True closing-line capture via game_id lookup
//
// Runs every 15 minutes. For each pick whose game starts within the next 30
// minutes OR started in the last 2 hours, and hasn't had a genuine closing
// line captured yet:
//   1. Fetches the current Pinnacle h2h line from The Odds API (EU region)
//      using the pick's game_id so we match the exact event — no fuzzy logic.
//   2. Determines which side the pick was on (home vs away) from picks.home_team.
//   3. Writes to bets table:
//        closing_odds          — Pinnacle closing line, our side
//        closing_odds_away     — Pinnacle closing line, other side
//        closing_odds_captured — true (signals that real data is present)
//        clv                   — no-vig CLV: (placed_decimal − fair_decimal) / fair_decimal
//   4. Writes to results table (if the pick is already resolved):
//        closing_line          — same as bets.closing_odds
//        closing_line_away     — same as bets.closing_odds_away
//
// Schema requirements (run once in Supabase SQL editor):
//   ALTER TABLE bets    ADD COLUMN IF NOT EXISTS closing_odds_away INTEGER;
//   ALTER TABLE bets    ADD COLUMN IF NOT EXISTS clv               NUMERIC;
//   ALTER TABLE results ADD COLUMN IF NOT EXISTS closing_line_away INTEGER;
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_KEY, ODDS_API_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

// Decimal → American odds (Pinnacle EU returns decimal)
function decimalToAmerican(decimal) {
  if (!decimal || decimal <= 1) return null;
  if (decimal >= 2.0) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

// Determine whether pick.pick refers to the home side.
// Compares the pick string against home_team and away_team using exact match,
// last-word suffix, and substring — mirrors the teamsMatch logic in check-results.js.
// Returns true (home), false (away), or null (cannot determine).
function pickIsHome(pickName, homeTeam, awayTeam) {
  if (!pickName) return null;
  const p = pickName.toLowerCase().trim();
  const h = (homeTeam || '').toLowerCase().trim();
  const a = (awayTeam || '').toLowerCase().trim();

  if (p === h) return true;
  if (p === a) return false;

  // Last-word suffix: "Lakers" vs "Los Angeles Lakers"
  const lastP = p.split(' ').pop() || '';
  if (lastP.length > 3) {
    const lastH = (h.split(' ').pop() || '');
    const lastA = (a.split(' ').pop() || '');
    if (lastP === lastH) return true;
    if (lastP === lastA) return false;
  }

  // Substring containment
  if (h && (h.includes(p) || p.includes(h))) return true;
  if (a && (a.includes(p) || p.includes(a))) return false;

  return null; // Cannot determine — caller should skip this pick
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    console.error('[capture-closing-lines] ODDS_API_KEY not set');
    return res.status(500).json({ error: 'ODDS_API_KEY not configured' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const now         = new Date();
  const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const windowEnd   = new Date(now.getTime() + 30 * 60 * 1000);      // 30 min ahead

  console.log('[capture-closing-lines] === Run started', now.toISOString(), '===');
  console.log(`[capture-closing-lines] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

  // ── Step 1: Fetch picks in the capture window ────────────────────────────────
  const { data: picks, error: picksErr } = await supabase
    .from('picks')
    .select('id, pick, sport, game_id, game_time, home_team, away_team, odds, pinnacle_odds, pinnacle_away_odds')
    .gte('game_time', windowStart.toISOString())
    .lte('game_time', windowEnd.toISOString())
    .eq('archived', false)
    .order('game_time', { ascending: true });

  if (picksErr) {
    console.error('[capture-closing-lines] Supabase picks query error — full error:', JSON.stringify(picksErr));
    return res.status(500).json({ error: picksErr.message, details: picksErr });
  }

  if (!picks?.length) {
    console.log('[capture-closing-lines] No picks in window — nothing to do');
    return res.status(200).json({ message: 'No picks in window', captured: 0 });
  }

  // Query the bets table to find which picks already have a genuine closing line
  // captured (closing_odds was removed from the picks table — closing_odds_captured
  // on bets is now the authoritative signal).
  let alreadyCapturedIds = new Set();
  try {
    const pickIds = picks.map(p => p.id);
    const { data: captured, error: capturedErr } = await supabase
      .from('bets')
      .select('pick_id')
      .in('pick_id', pickIds)
      .eq('closing_odds_captured', true);

    if (capturedErr) {
      // Non-fatal — log and proceed to re-capture all picks in the window
      console.warn('[capture-closing-lines] bets closing_odds_captured query failed (non-fatal):', JSON.stringify(capturedErr));
    } else if (captured?.length) {
      alreadyCapturedIds = new Set(captured.map(r => r.pick_id));
    }
  } catch (e) {
    console.warn('[capture-closing-lines] bets closing_odds_captured query threw (non-fatal):', e.message);
  }

  const needsCapture = picks.filter(p => !alreadyCapturedIds.has(p.id));

  if (!needsCapture.length) {
    console.log(`[capture-closing-lines] All ${picks.length} pick(s) in window already have closing lines`);
    return res.status(200).json({ message: 'All closing lines already captured', captured: 0 });
  }

  console.log(`[capture-closing-lines] ${needsCapture.length}/${picks.length} pick(s) need capture`);

  // ── Step 2: Group by sport → Set of game_ids to minimise API calls ───────────
  // Multiple picks for the same game (e.g. two bettors on the same matchup) share one fetch.
  const sportGameMap = {}; // sport → Set<game_id>
  for (const pick of needsCapture) {
    if (!pick.sport || !pick.game_id) {
      console.warn(`[capture-closing-lines] Pick ${pick.id} missing sport or game_id — will skip`);
      continue;
    }
    if (!sportGameMap[pick.sport]) sportGameMap[pick.sport] = new Set();
    sportGameMap[pick.sport].add(pick.game_id);
  }

  // Cache: game_id → { homeAmerican, awayAmerican, home_team, away_team }
  const closingCache = {};

  // ── Step 3: Fetch Pinnacle closing line per sport, one call per event ────────
  for (const sport of Object.keys(sportGameMap)) {
    const gameIds = [...sportGameMap[sport]];
    console.log(`[capture-closing-lines] ${sport}: fetching Pinnacle for ${gameIds.length} event(s): ${gameIds.join(', ')}`);

    for (const gameId of gameIds) {
      // Use eventIds to fetch only this specific game — no sport-wide scan needed.
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=h2h&oddsFormat=decimal&eventIds=${gameId}`;

      try {
        const apiRes = await fetch(url);

        const remaining = apiRes.headers.get('x-requests-remaining');
        if (remaining) console.log(`[capture-closing-lines] API credits remaining:`, remaining);

        if (!apiRes.ok) {
          const body = await apiRes.text();
          console.error(`[capture-closing-lines] API ${apiRes.status} for ${sport} event ${gameId}: ${body.slice(0, 200)}`);
          continue;
        }

        const data = await apiRes.json();

        if (!Array.isArray(data) || data.length === 0) {
          // Game may have already started and been removed from the feed — log and continue.
          console.warn(`[capture-closing-lines] No data returned for game_id=${gameId} (${sport}) — event may have started or closed`);
          continue;
        }

        const game = data[0];
        const h2h  = game.bookmakers?.[0]?.markets?.find(m => m.key === 'h2h');

        if (!h2h?.outcomes?.length) {
          console.warn(`[capture-closing-lines] No h2h market in Pinnacle response for game_id=${gameId}`);
          continue;
        }

        // EU region returns decimal odds — convert to American for storage consistency
        const homeOutcome = h2h.outcomes.find(o => o.name === game.home_team);
        const awayOutcome = h2h.outcomes.find(o => o.name === game.away_team);

        if (!homeOutcome || !awayOutcome) {
          console.warn(`[capture-closing-lines] Outcome names don't match for game_id=${gameId} — home="${game.home_team}" away="${game.away_team}" | outcomes: ${h2h.outcomes.map(o => o.name).join(', ')}`);
          continue;
        }

        closingCache[gameId] = {
          homeAmerican: decimalToAmerican(homeOutcome.price),
          awayAmerican: decimalToAmerican(awayOutcome.price),
          home_team:    game.home_team,
          away_team:    game.away_team,
        };

        console.log(`[capture-closing-lines] Cached ${sport} game_id=${gameId}: ${game.away_team} @ ${game.home_team} | home=${closingCache[gameId].homeAmerican} away=${closingCache[gameId].awayAmerican}`);

      } catch (e) {
        console.error(`[capture-closing-lines] Fetch threw for game_id=${gameId} (${sport}):`, e.message);
      }
    }
  }

  // ── Step 4: Apply cached closing odds to each pick ───────────────────────────
  let captured = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const pick of needsCapture) {
    if (!pick.game_id || !closingCache[pick.game_id]) {
      console.warn(`[capture-closing-lines] No cached closing line for pick ${pick.id} (game_id=${pick.game_id ?? 'null'}) — skipping`);
      skipped++;
      continue;
    }

    const cached = closingCache[pick.game_id];

    // Determine which side was picked (home vs away)
    const isHome = pickIsHome(pick.pick, pick.home_team ?? cached.home_team, pick.away_team ?? cached.away_team);

    if (isHome === null) {
      console.error(`[capture-closing-lines] Cannot determine side for pick ${pick.id}: pick="${pick.pick}" home="${pick.home_team}" away="${pick.away_team}" cached_home="${cached.home_team}" cached_away="${cached.away_team}"`);
      failed++;
      continue;
    }

    const pinnaclePickSideOdds  = isHome ? cached.homeAmerican : cached.awayAmerican;
    const pinnacleOtherSideOdds = isHome ? cached.awayAmerican : cached.homeAmerican;

    if (pinnaclePickSideOdds == null) {
      console.error(`[capture-closing-lines] Null closing odds for pick ${pick.id} — isHome=${isHome} cache:`, cached);
      failed++;
      continue;
    }

    console.log(`[capture-closing-lines] Pick ${pick.id} "${pick.pick}" | isHome=${isHome} | closing=${pinnaclePickSideOdds} otherSide=${pinnacleOtherSideOdds}`);

    // ── 4a: Update bets table ──────────────────────────────────────────────────
    // Match on pick_id (reliable UUID foreign key) — avoids the fragile
    // pick-text + sport + date fuzzy join that silently misses on any text mismatch.
    // Also compute no-vig CLV: (placed_decimal − fair_closing_decimal) / fair_closing_decimal
    // Positive = bettor's placed odds were longer than the de-vigged closing Pinnacle line.
    try {
      // No-vig CLV computation — pick.odds is American; convert to decimal for the formula.
      let clvValue = null;
      const decimalPlaced = (pick.odds != null && !isNaN(pick.odds) && pick.odds !== 0)
        ? (pick.odds > 0 ? 1 + pick.odds / 100 : 1 + 100 / Math.abs(pick.odds))
        : null;
      if (decimalPlaced && pinnaclePickSideOdds != null && pinnacleOtherSideOdds != null) {
        const rawClose     = pinnaclePickSideOdds  > 0
          ? 100 / (pinnaclePickSideOdds  + 100)
          : Math.abs(pinnaclePickSideOdds)  / (Math.abs(pinnaclePickSideOdds)  + 100);
        const rawCloseAway = pinnacleOtherSideOdds > 0
          ? 100 / (pinnacleOtherSideOdds + 100)
          : Math.abs(pinnacleOtherSideOdds) / (Math.abs(pinnacleOtherSideOdds) + 100);
        const total = rawClose + rawCloseAway;
        // Sanity-check vig range (Pinnacle is ~2–4%)
        if (total > 0.9 && total < 1.2) {
          const fairProb    = rawClose / total;
          const fairDecimal = 1 / fairProb;
          clvValue = Math.round(((decimalPlaced - fairDecimal) / fairDecimal) * 10000) / 10000;
        }
      }

      const { error: betsErr } = await supabase
        .from('bets')
        .update({
          closing_odds:             pinnaclePickSideOdds,
          closing_odds_away:        pinnacleOtherSideOdds,
          closing_odds_captured:    true,
          clv:                      clvValue,
          closing_odds_captured_at: new Date().toISOString(),
        })
        .eq('pick_id', pick.id);

      if (betsErr) {
        console.warn(`[capture-closing-lines] bets update failed for pick ${pick.id} (non-fatal):`, betsErr.message);
      } else {
        console.log(`[capture-closing-lines] bets updated — pick_id=${pick.id} "${pick.pick}" closing=${pinnaclePickSideOdds} away=${pinnacleOtherSideOdds} clv=${clvValue}`);
      }
    } catch (e) {
      console.warn(`[capture-closing-lines] bets update threw for pick ${pick.id} (non-fatal):`, e.message);
    }

    // ── 4b: Write closing_line to results if this pick is already resolved ─────
    try {
      const { data: resultRow, error: resultQueryErr } = await supabase
        .from('results')
        .select('id, outcome')
        .eq('pick_id', pick.id)
        .neq('outcome', 'pending')
        .maybeSingle();

      if (resultQueryErr) {
        console.warn(`[capture-closing-lines] results query failed for pick ${pick.id} (non-fatal):`, resultQueryErr.message);
      } else if (resultRow) {
        const { error: resultsErr } = await supabase
          .from('results')
          .update({
            closing_line:      pinnaclePickSideOdds,
            closing_line_away: pinnacleOtherSideOdds,
          })
          .eq('pick_id', pick.id);

        if (resultsErr) {
          // closing_line_away column may not exist yet — non-fatal
          console.warn(`[capture-closing-lines] results update failed for pick ${pick.id} (non-fatal):`, resultsErr.message);
          console.warn('[capture-closing-lines] Hint: ensure results table has closing_line_away INTEGER column');
        } else {
          console.log(`[capture-closing-lines] results updated — pick ${pick.id} closing_line=${pinnaclePickSideOdds} away=${pinnacleOtherSideOdds}`);
        }
      } else {
        console.log(`[capture-closing-lines] Pick ${pick.id} not yet resolved — results not updated`);
      }
    } catch (e) {
      console.warn(`[capture-closing-lines] results write threw for pick ${pick.id} (non-fatal):`, e.message);
    }

    captured++;
  }

  console.log(`[capture-closing-lines] === Done | total_in_window=${picks.length} needs_capture=${needsCapture.length} captured=${captured} skipped=${skipped} failed=${failed} ===`);
  return res.status(200).json({ captured, skipped, failed, total: needsCapture.length });
}
