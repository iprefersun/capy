import { createClient } from '@supabase/supabase-js';

// ── Hard limits — enforced here, not in odds.html ────────────────────────────
const SHARP_EV_MIN      = 1.5;   // minimum EV% for a sharp pick
const SHARP_EV_MAX      = 5.0;   // above this is inflated/suspicious
const SHARP_ODDS_MIN    = -200;  // must be at least -200 (not a huge favorite)
const SHARP_ODDS_MAX    = 300;   // +300 is the ceiling for "sharp" territory
const SHARP_MAX_DAILY   = 3;

const LONGSHOT_EV_MIN   = 1.0;   // lower floor OK — harder to find value
const LONGSHOT_EV_MAX   = 5.0;   // same ceiling — anything higher is suspicious
const LONGSHOT_ODDS_MIN = 300;   // must be strictly above +300 to qualify
const LONGSHOT_ODDS_MAX = 1200;  // +1200 cap — beyond this is lottery, not edge
const LONGSHOT_MAX_DAILY = 2;

const DAILY_TOTAL_LIMIT = 5;

// ── Bets table guards (stricter — canonical dataset) ─────────────────────────
const BETS_SHARP_EV_MIN    = 0.015;  // 1.5%
const BETS_LONGSHOT_EV_MIN = 0.010;  // 1.0%
const BETS_EV_MAX          = 0.050;  // 5.0%

// ── American → decimal odds conversion ───────────────────────────────────────
function amToDecimal(american) {
  if (american == null || isNaN(american)) return null;
  return american > 0 ? (american / 100) + 1 : (100 / Math.abs(american)) + 1;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { picks } = req.body;
  if (!picks || !Array.isArray(picks) || picks.length === 0) {
    return res.status(400).json({ error: 'Invalid picks data' });
  }

  // ── Step 1: Check daily limit ─────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const { data: todayRows, error: countErr } = await supabase
    .from('picks')
    .select('id, pick_type')
    .gte('created_at', today);

  if (countErr) {
    console.error('[SavePicks] Error checking daily count:', countErr.message);
    return res.status(500).json({ error: 'DB error checking daily limit' });
  }

  const todayAll      = todayRows?.length || 0;
  const todaySharp    = todayRows?.filter(p => !p.pick_type || p.pick_type === 'sharp').length || 0;
  const todayLongshot = todayRows?.filter(p => p.pick_type === 'longshot').length || 0;

  if (todayAll >= DAILY_TOTAL_LIMIT) {
    console.log(`[SavePicks] Daily limit reached — ${todayAll} picks already saved today — skipping`);
    return res.status(200).json({
      message: '[SavePicks] Daily limit reached — skipping',
      savedToday: todayAll,
      saved: 0,
    });
  }

  // ── Step 2: Validate each pick against strict thresholds ──────────────────
  const validated = [];

  for (const p of picks) {
    const label = `${p.game_id} (${p.pick})`;

    // Normalize EV scale — odds.html sometimes sends 3.15 as 315
    let ev = p.ev_percent;
    if (ev != null && Math.abs(ev) > 100) {
      console.warn(`[SavePicks] EV scale corrected: ${ev} → ${ev / 100} for ${label}`);
      ev = ev / 100;
    }

    // Hard reject: missing, NaN, or negative EV
    if (ev == null || isNaN(ev) || ev < 0) {
      console.log(`[SavePicks] SKIP ${label} — EV null/negative (${ev})`);
      continue;
    }

    const odds = p.odds;
    if (odds == null || isNaN(odds)) {
      console.log(`[SavePicks] SKIP ${label} — odds missing`);
      continue;
    }

    const pickType = p.pick_type;

    if (pickType === 'sharp') {
      if (ev < SHARP_EV_MIN || ev > SHARP_EV_MAX) {
        console.log(`[SavePicks] SKIP sharp ${label} — EV ${ev.toFixed(2)}% not in [${SHARP_EV_MIN}%, ${SHARP_EV_MAX}%]`);
        continue;
      }
      if (odds < SHARP_ODDS_MIN || odds > SHARP_ODDS_MAX) {
        console.log(`[SavePicks] SKIP sharp ${label} — odds ${odds} not in [${SHARP_ODDS_MIN}, +${SHARP_ODDS_MAX}]`);
        continue;
      }
    } else if (pickType === 'longshot') {
      if (ev < LONGSHOT_EV_MIN || ev > LONGSHOT_EV_MAX) {
        console.log(`[SavePicks] SKIP longshot ${label} — EV ${ev.toFixed(2)}% not in [${LONGSHOT_EV_MIN}%, ${LONGSHOT_EV_MAX}%]`);
        continue;
      }
      // Odds must be strictly above +300 and at most +1200
      if (odds <= LONGSHOT_ODDS_MIN || odds > LONGSHOT_ODDS_MAX) {
        console.log(`[SavePicks] SKIP longshot ${label} — odds +${odds} not in (+${LONGSHOT_ODDS_MIN}, +${LONGSHOT_ODDS_MAX}]`);
        continue;
      }
    } else {
      console.log(`[SavePicks] SKIP ${label} — unknown pick_type "${pickType}"`);
      continue;
    }

    validated.push({ ...p, ev_percent: ev });
  }

  if (validated.length === 0) {
    console.log('[SavePicks] No picks passed validation threshold checks');
    return res.status(200).json({ message: 'No picks passed validation', saved: 0 });
  }

  // ── Step 3: Remove any game already saved today ───────────────────────────
  const gameIds = validated.map(p => p.game_id);
  const { data: existing } = await supabase
    .from('picks')
    .select('game_id')
    .in('game_id', gameIds)
    .gte('created_at', today);

  const existingIds = new Set((existing || []).map(e => e.game_id));
  const deduped = validated.filter(p => !existingIds.has(p.game_id));

  if (deduped.length === 0) {
    console.log('[SavePicks] All validated picks already saved today');
    return res.status(200).json({ message: 'All picks already saved today', saved: 0 });
  }

  // ── Step 4: Apply hard caps — top N by quality score / EV ─────────────────
  const sharpPool    = deduped.filter(p => p.pick_type === 'sharp');
  const longshotPool = deduped.filter(p => p.pick_type === 'longshot');

  // Sharp: rank by quality_score (composite), tiebreak by ev_percent
  sharpPool.sort((a, b) =>
    ((b.quality_score || 0) - (a.quality_score || 0)) ||
    ((b.ev_percent    || 0) - (a.ev_percent    || 0))
  );

  // Longshot: rank purely by ev_percent
  longshotPool.sort((a, b) => (b.ev_percent || 0) - (a.ev_percent || 0));

  const sharpSlots    = Math.max(0, SHARP_MAX_DAILY    - todaySharp);
  const longshotSlots = Math.max(0, LONGSHOT_MAX_DAILY - todayLongshot);
  const totalSlots    = Math.max(0, DAILY_TOTAL_LIMIT  - todayAll);

  const selectedSharp    = sharpPool.slice(0, sharpSlots);
  const selectedLongshot = longshotPool.slice(0, longshotSlots);
  const selected = [...selectedSharp, ...selectedLongshot].slice(0, totalSlots);

  if (selected.length === 0) {
    console.log(`[SavePicks] Daily slots exhausted (sharp: ${todaySharp}/${SHARP_MAX_DAILY}, longshot: ${todayLongshot}/${LONGSHOT_MAX_DAILY}) — nothing saved`);
    return res.status(200).json({ message: 'Daily pick slots filled', saved: 0 });
  }

  console.log(`[SavePicks] Saving ${selected.length} picks (${selectedSharp.length} sharp, ${selectedLongshot.length} longshot):`);
  selected.forEach(p => {
    console.log(`  → ${p.pick_type} | ${p.pick} | EV: ${p.ev_percent?.toFixed(2)}% | odds: ${p.odds} | qs: ${(p.quality_score || 0).toFixed(2)}`);
  });

  // ── Step 5: Insert into picks table ───────────────────────────────────────
  const { data, error } = await supabase.from('picks').insert(selected);
  if (error) {
    console.error('[SavePicks] Insert error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  console.log(`[SavePicks] Successfully saved ${selected.length} picks`);

  // ── Step 6: Insert into bets table (canonical performance dataset) ─────────
  // Only insert if we have a valid Pinnacle reference for both sides
  const betsRows = [];

  for (const p of selected) {
    const evDecimal = p.ev_percent / 100;   // picks stores 2.1 → bets stores 0.021

    // Bets-specific EV guard
    const evMin = p.pick_type === 'longshot' ? BETS_LONGSHOT_EV_MIN : BETS_SHARP_EV_MIN;
    if (evDecimal < evMin || evDecimal > BETS_EV_MAX) {
      console.log(`[SavePicks/Bets] SKIP ${p.pick} — EV ${evDecimal.toFixed(4)} out of bets range`);
      continue;
    }

    // Require both Pinnacle sides for a clean bets record
    if (p.pinnacle_odds == null || p.pinnacle_away_odds == null) {
      console.log(`[SavePicks/Bets] SKIP ${p.pick} — missing Pinnacle sides (pinnacle_odds=${p.pinnacle_odds}, away=${p.pinnacle_away_odds})`);
      continue;
    }

    const decimalOdds = amToDecimal(p.odds);
    if (!decimalOdds) {
      console.log(`[SavePicks/Bets] SKIP ${p.pick} — could not convert odds ${p.odds} to decimal`);
      continue;
    }

    betsRows.push({
      pick:               p.pick,
      sport:              p.sport,
      game_time:          p.game_time,
      date:               p.game_time ? p.game_time.split('T')[0] : today,
      bet_type:           p.bet_type || 'ml',
      pick_type:          p.pick_type,
      odds_placed:        p.odds,
      decimal_odds:       decimalOdds,
      book:               p.book,
      ev_percent:         evDecimal,
      pinnacle_odds:      p.pinnacle_odds,
      pinnacle_away_odds: p.pinnacle_away_odds,
      true_probability:   p.true_probability ?? null,
      stake_units:        p.pick_type === 'longshot' ? 0.5 : 1.0,
      result:             'pending',
      profit_units:       null,
      closing_odds:       null,
      clv:                null,
      archived:           false,
    });
  }

  if (betsRows.length > 0) {
    const { error: betsErr } = await supabase.from('bets').insert(betsRows);
    if (betsErr) {
      // Log but don't fail the request — picks were already saved successfully
      console.error('[SavePicks/Bets] Bets insert error (non-fatal):', betsErr.message);
    } else {
      console.log(`[SavePicks/Bets] Inserted ${betsRows.length} rows into bets table`);
    }
  } else {
    console.log('[SavePicks/Bets] No picks qualified for bets table (missing Pinnacle data or EV out of range)');
  }

  return res.status(200).json({ saved: selected.length, betsSaved: betsRows.length, data });
}
