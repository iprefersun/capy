# SESSION_LOG.md

Append-only log of every Claude Code / Claude session on GetCapy.
Newest entries at top. Archive to SESSION_LOG_ARCHIVE.md when past ~50 entries.

---

## 2026-04-18 (session 18) — MAGIC_TEST cleanup + CLAUDE.md CLV formula correction

**Goal:** Two documentation/cleanup tasks only — no production logic changes.

**Files changed:**
- `api/capture-closing-lines.js` — removed all 4 MAGIC_TEST instrumentation blocks
  (MAGIC_PICK_ID/MAGIC_GAME_TIME constants, window log, in-window status log, Pinnacle
  response log, and captured-successfully log). Magic game test was confirmed working in
  session 13; this was expired dead code. File was also first-committed to git this session
  (existed on disk but had never been `git add`ed).
- `CLAUDE.md` — CLV pipeline section updated:
  (A) corrected active cron from `capture-closing-odds.js` (disabled/410) to
      `capture-closing-lines.js` (15-min schedule, game_id exact-match);
  (B) replaced deprecated implied-probability ratio formula
      `(implied_prob_of_closing / implied_prob_of_placed) - 1`
      with canonical no-vig formula:
      `clv = (placed_decimal - fairDecimal) / fairDecimal`
      where `fairDecimal = 1 / (rawClose / (rawClose + rawCloseAway))`;
  (C) documented which files use the canonical formula (cron, verify script, bets.clv);
  (D) added explicit deprecation notice for old formula.

**Verified:**
- `grep MAGIC_TEST api/capture-closing-lines.js` → no matches ✓
- CLAUDE.md formula section reads correctly (confirmed via Read tool) ✓
- Deploy: `capy-8y34jwjbm` — READY ✓ (10s build)
- `node scripts/verify-clv.js` not re-run (no logic changed — output would be identical to session 13)

**Broken / unverified:**
- Nothing broken. No logic was touched.

**Next session starts with:**
1. Monitor capture rate — expect ~100% on new picks going forward
2. Once `settled_with_clv` reaches ~10–15, revisit whether n=30 threshold is appropriate
3. Confirm partial unique index (`bets_unique_active_pick`) was created in Supabase (session 17 action item)

---

## 2026-04-17 (session 17) — Partial unique index on bets + save-picks.js upsert

**Goal:** Prevent duplicate active bets in the `bets` table while allowing void/push rows to coexist; update save-picks.js INSERT to use upsert semantics.

**Task 1 — SQL (user runs in Supabase SQL Editor):**
```sql
CREATE UNIQUE INDEX bets_unique_active_pick
  ON bets (pick, game_time, book)
  WHERE result NOT IN ('void', 'push');
```
This partial index enforces uniqueness only on active bets (non-void, non-push). Allows voided/pushed duplicates for the same game.

**Task 2 — Files changed:**
- `api/save-picks.js` — replaced simple `.insert(betsRows)` with SELECT-then-INSERT/UPDATE pattern.

**Why not Supabase `.upsert()`:**
Supabase PostgREST generates `ON CONFLICT (cols) DO UPDATE` without a WHERE predicate. PostgreSQL requires `ON CONFLICT (cols) WHERE predicate` to match a partial index. Using `.upsert()` at runtime would throw: "there is no unique or exclusion constraint matching the ON CONFLICT specification". Implemented equivalent semantics in JS instead:
1. SELECT active conflicts for the same (pick, game_time, book) rows
2. Rows with no conflict → INSERT
3. Rows with conflict → UPDATE odds_placed only

**What was VERIFIED:**
- save-picks.js edit applied cleanly (confirmed via Edit tool)
- Build compiled cleanly on Vercel (no ESM/CJS errors)
- Deploy ID: `dpl_2NbozEAQrp8iBtuvRFZZfqTt4kbL`
- Production: https://www.getcapy.co

**What is UNVERIFIED:**
- Partial index creation (user must run SQL in Supabase — not yet confirmed)
- Live upsert behavior: won't be exercised until save-picks.js next runs (next daily cron)

**Exact next action for next session:**
Confirm index exists: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='bets' AND indexname='bets_unique_active_pick';`
Once closing_odds_captured_at has been written by the cron for a few days, re-add CLV Captured column to record.html (helpers `fmtClvCaptured` and `fmtPickedVegas` already exist).

---

## 2026-04-17 (session 16) — Footer link to /oddsjam-alternative.html on all pages

**Goal:** Add "Capy vs OddsJam" footer link pointing to /oddsjam-alternative.html on every page that has a footer.

**Files changed (8 pages):**
- `terms.html` — added `<a href="/oddsjam-alternative.html">Capy vs OddsJam</a>` inside existing `.footer-links` div alongside Terms and Privacy.
- `privacy.html` — same as terms.html.
- `success.html` — added link to existing inline-flex div alongside Terms and Privacy, matching existing inline style pattern.
- `index.html` — no footer links existed; added a new `<div style="display:flex;gap:16px;">` with the link between the logo and copyright.
- `odds.html` — appended `&nbsp;·&nbsp; <a href="/oddsjam-alternative.html" style="color:var(--amber);">Capy vs OddsJam</a>` to `.dash-footer` text.
- `props.html` — same pattern as odds.html.
- `stats.html` — same pattern as odds.html (`.page-footer`).
- `game.html` — same pattern as odds.html (`.dash-footer`).

Skipped: `oddsjam-alternative.html` (self-link), `record.html` (no footer element), `admin.html` (internal tool).

**Verified:**
- Deploy: `dpl_BwcVVUQbZnebY5KyHLVWnsJJG84S` — READY ✓
- All 8 edits applied cleanly with no string-match errors.

**Broken / unverified:**
- Not browser-tested. Confirm link appears in each page's footer at correct position and style matches surroundings.

**Next session starts with:** (no specific follow-up required for this task)

---

## 2026-04-17 (session 15) — bets.clv as source of truth; remove CLV Captured column; add closing_odds_captured_at to cron

**Goal:** Three targeted fixes: switch record.html CLV to stored bets.clv (not recomputed), remove the always-empty CLV Captured column, add closing_odds_captured_at to active cron so data will exist when column is re-added.

**Pre-session finding:**
- `computed_clv` formula in get-stats.js (`toProb(placed) - fairClose`) had an **inverted sign** — a bet with a genuine edge showed negative CLV. bets.clv uses the correct formula `(decimalPlaced - fairDecimal) / fairDecimal` which is positive when bettor got better-than-fair odds. Fix 1 corrected this, not just a preference.

**Files changed:**
- `api/get-stats.js` — (A) `calcStats()`: changed CLV aggregation from `r.computed_clv` to `r.bets_clv`. (B) Removed entire `computed_clv` computation block (~40 lines): debug console.log, `toProb` helper, for-loop that computed `result.computed_clv` from `results.closing_line`, and the two post-loop console.logs. (C) Bets supplement select: added `clv` to the field list. (D) Bets map loop: added `r.bets_clv = b?.clv ?? null` attachment to each active result row.
- `record.html` — (A) Resolved rows: changed `fmtClvPick(r.computed_clv)` → `fmtClvPick(r.bets_clv)` and `clvPct = r.computed_clv…` → `r.bets_clv…`. (B) Removed `fmtClvCaptured()` function entirely. (C) Removed `<th>CLV Cap.</th>` from thead. (D) Changed all 3 `colspan="12"` → `colspan="11"`. (E) Removed `clvCap` variable + `${clvCap}` cell from resolved, pending, and prop row templates. Verified: thead=11, row1=11, row2=11, row3=11 (node script check).
- `api/capture-closing-lines.js` — Added `closing_odds_captured_at: new Date().toISOString()` to the bets UPDATE block alongside `closing_odds`, `closing_odds_away`, `closing_odds_captured`, and `clv`.

**Verified:**
- Deploy: `dpl_E956kEkw56frhc5nCuG2QBuVG9hM` — READY ✓
- `node scripts/verify-clv.js` post-deploy:
  - `clv_math_mismatch: 0` ✓
  - `captured_but_no_value: 0` ✓
  - `value_but_not_marked_captured: 0` ✓
  - 7 bets with closing odds; all 7 marked captured; all 7 have CLV
  - `closing_equals_pinnacle_exact: 1` — accepted artifact (bff766de, Rockies Apr 17), per capy-gotchas.md
  - `before_2h: 1` — same artifact, no regression
  - 4 settled with CLV — record.html correctly blocked (n < 30) ✓

**Broken / unverified:**
- `closing_odds_captured_at` write in cron: deployed but not yet fired against a real game. Will confirm in Vercel logs on next capture (next game near start time within cron window). Look for `bets updated` log line then query: `SELECT closing_odds_captured_at FROM bets WHERE closing_odds_captured = true AND closing_odds_captured_at IS NOT NULL ORDER BY closing_odds_captured_at DESC LIMIT 5`.
- CLV sign fix effect on displayed values: the inverted-sign bug only affected `computed_clv` (which is now removed). `bets.clv` values were always correctly signed. All existing bets with CLV show the same values as before — no visual regression expected.
- CLV tooltip on record.html: still code-verified only. Uses `r.bets_clv` and `r.closing_line` for the tooltip body — verify by hovering a row with captured CLV.

**Next session starts with:**
1. Check Vercel logs for next cron run: confirm `bets updated` log includes `closing_odds_captured_at` value
2. Query Supabase: `SELECT id, pick, closing_odds_captured_at FROM bets WHERE closing_odds_captured = true ORDER BY closing_odds_captured_at DESC LIMIT 5` — expect non-null timestamps for any captures after this deploy
3. Once real `closing_odds_captured_at` timestamps exist (a few days of captures), re-add CLV Captured column to record.html (reuse `fmtClvCaptured` and `fmtPickedVegas` from session 14)

---

## 2026-04-17 (session 14) — Picked/CLV Captured columns on record.html; OddsJam SEO page

**Goal:** Add Picked and CLV Captured columns to record.html picks table; create /oddsjam-alternative.html for SEO.

**Pre-session checks:**
- `closing_odds_captured_at` confirmed on **bets table** (per CLAUDE.md schema)
- `capture-closing-lines.js` does NOT write `closing_odds_captured_at` — legacy column from the disabled `capture-closing-odds.js` cron. Will be NULL for all picks going forward. Column exists but is effectively empty until someone re-adds cron capture of it.
- `record.html` reads from: `results+picks` (type=record), `picks` alone (pending), `bets` (props only)
- CLV on record.html uses `r.computed_clv` — RECOMPUTED server-side from `results.closing_line`, NOT the stored `bets.clv`. This is consistent with the no-vig formula but is not "stored by cron" strictly speaking. The tooltip label "stored by cron" refers to the closing line being stored; the CLV value itself is computed in get-stats.js from that closing line. Reported to user below.

**Files changed:**
- `api/get-stats.js` — handleRecord: added secondary bets fetch after building activeResults + pendingPicks; queries `bets` table by pick_id to get `observed_at`, `closing_odds_captured_at`, `closing_odds_captured`; attaches these fields to each result row and each pending pick before the return. Allows record.html to display pick time + CLV capture time without a separate frontend fetch.
- `record.html` — (1) added `fmtPickedVegas(iso)` helper: formats timestamp in America/Los_Angeles as "Apr 16 · 8:42 am"; (2) added `fmtClvCaptured(capturedAt, isCaptured, observedAt)` helper: returns "—" unless captured=true, capturedAt non-null, and capturedAt differs from observedAt by >5s (backfill artifact filter); (3) added "Picked" column (after Date) and "CLV Cap." column (after CLV) to thead; (4) updated picks-table min-width 760px → 960px; (5) updated all 3 colspan="10" → colspan="12"; (6) added cells to resolved, pending, and prop row templates; (7) added CLV tooltip on resolved rows: title="Placed: {odds}&#10;Pinnacle closing: {odds}&#10;CLV: X.XX% (no-vig vs Pinnacle, stored by cron)" — matches admin.html format.
- `oddsjam-alternative.html` — new SEO page: hero, honest comparison table (8 features), "Who is Capy for?" and "Who is OddsJam for?" callouts, CTA section, footer. Title tag: "OddsJam Alternative for Casual Bettors | Capy". H1: "A simpler alternative to OddsJam". Meta description per spec. "OddsJam alternative" appears 4 times naturally. Internal links to /props.html (anchor: "explore prop bets") and /odds.html (anchor: "today's picks"). Mobile responsive. Dark mode supported via data-theme="dark".
- `sitemap.xml` — added /oddsjam-alternative.html with priority 0.6, changefreq monthly.
- `capy-gotchas.md` — new file created this session with two gotcha entries (pre-existing artifact and CLV sample size).

**Verified:**
- Deploy: `dpl_BtpFdzhSjqbDoyUDRRz1vKf8u1Sg` — READY ✓
- get-stats.js ESM compile succeeded (no build errors)
- All 3 row types in picks table get Picked + CLV Captured cells → no colspan mismatch
- colspan updated from 10 → 12 in 3 places (loading row, empty-with-return, empty-at-end)

**Broken / unverified:**
- CLV tooltip on record.html: code-verified only, not browser-tested. Needs hover test on a resolved row with closing_line data.
- "Picked" column will show picks.created_at as fallback for any resolved game picks where bets row doesn't have observed_at (pre-Apr 16 bets). This is correct behavior.
- "CLV Cap." column will show "—" for essentially all rows going forward because `capture-closing-lines.js` doesn't write `closing_odds_captured_at`. The column is structurally correct but data is mostly absent until closing_odds_captured_at write is added back to the active cron (or accepted as permanently empty).
- CLV discrepancy note: record.html CLV is computed from `results.closing_line` in get-stats.js (not stored `bets.clv`). Values should match since both use no-vig formula and same Pinnacle source, but they are different fields. If user wants strict "stored by cron" CLV on record.html, get-stats.js handleRecord would need to join bets.clv via the pick_id supplemental fetch (already in place — could add `clv` to the select and expose it).
- SEO page: not browser-tested for mobile layout. Dark mode: uses data-theme="dark" which matches record.html but check if index.html uses the same mechanism (it does).

**Next session starts with:**
1. Browser-test record.html: confirm Picked column shows "Apr 16 · 8:42 am" format; confirm CLV tooltip appears on resolved rows with closing data
2. Decide: add `closing_odds_captured_at` write back to `capture-closing-lines.js` so CLV Cap. column populates for new picks
3. Decide: whether to use stored `bets.clv` on record.html instead of computed_clv (the supplemental bets fetch is already in place — just add `clv` to the select)


Format per entry:
- **Goal:** one sentence
- **Files changed:** paths + one-line summary each
- **Verified:** what was tested, with evidence (SQL output, log output, screenshot)
- **Broken / unverified:** what is still wrong or untested
- **Next session starts with:** exact first action

---

## 2026-04-18 (session 13) — CLV pipeline confirmed healthy; duplicate guard; tracking start date

**Goal:** Confirm CLV pipeline clean after SQL backfill, add cross-day duplicate pick guard to save-picks.js, add CLV tracking start date to record.html.

**Files changed:**
- `api/save-picks.js` — added Step 4b (cross-day dedup): after the existing game_id/today check, queries `bets` by `(game_time, pick, book)` to catch duplicates saved across a UTC midnight boundary. Logs `[SavePicks] SKIP duplicate — pick already exists for {team} {game_time} {book}` when triggered. Root cause of the two duplicate Rockies rows (Apr 18 00:41): `save-picks` ran at 23:5X UTC on Apr 17 saving pick A, then again at 00:0X UTC on Apr 18 saving pick B — the date-scoped game_id check saw no picks "today" and saved a second row with slightly different odds.
- `record.html` — added always-visible note `"CLV tracking active from April 16, 2026"` (11px, `--text-hint` color) below the CLV collecting message, inside the CLV cred-group.

**Verified (verify-clv.js output, third run):**
- `clv_math_mismatch: 0` ✓ — SQL backfill applied correctly between run 2 and run 3
- 7 bets with closing odds; all 7 marked captured; all 7 have CLV
- Capture rate: 10.6% (up from 6.5%) — 3 new captures since last run
- Orlando Magic captured: placed=+145, closing=+128, CLV=+0.0533 ✓ — MAGIC_TEST confirmed cron is working; window hypothesis (markets removed before window opens) was WRONG. Cron captured successfully.
- All CLV signs correct: Mets=-0.0369, Nashville=-0.0670, Giants=-0.0672 (negative, line moved against), Rockies/Magic positive (line moved in favor)
- Duplicate Rockies (9ea7f268...) voided in Supabase by user between sessions

**Capture rate analysis (by cohort):**
- Pre-Apr 16 picks: 0% capture (placed before cron existed — permanent)
- Apr 16 picks: ~17% capture (cron was live but early version)
- Apr 17–18 picks: ~100% capture (new `capture-closing-lines.js` cron working correctly)
- Low overall rate (10.6%) is a historical artifact — all new picks forward will have CLV

**System status after this session: CLV pipeline healthy, no active bugs**

**Broken / unverified:**
- Duplicate guard (Step 4b) not yet triggered in production — will confirm in next Vercel log with a `SKIP duplicate` line
- `closing_equals_pinnacle_exact`: 1 remaining (bff766de — Apr 17 Rockies, early capture, accepted artifact)
- Timing audit: 1 row in `before_2h` (same artifact, no `closing_odds_captured_at` written by new cron)
- 4 settled bets with CLV — record.html CLV aggregate still correctly blocked (n < 30)

**Next session starts with:**
1. Check Vercel logs for `[SavePicks] SKIP duplicate` to confirm guard fires
2. Monitor capture rate — expect ~100% on new picks going forward
3. Once settled_with_clv reaches ~10–15, revisit whether n=30 threshold is appropriate or too conservative

---

## 2026-04-17 (session 12) — Audit fixes: verify-clv formula, admin tooltip, cron summary log

**Goal:** Apply four targeted fixes from external audit: align verify-clv.js CLV formula to cron's no-vig formula, fix admin tooltip to display stored value only, add `total_in_window` to cron summary log, confirm sign convention.

**Files changed:**
- `scripts/verify-clv.js` — section 3 CLV math check: replaced single-sided `pClose/pPlaced - 1` with the exact no-vig formula from the cron (`(decimalPlaced - fairDecimal) / fairDecimal`); added `closing_odds_away !== null` guard (no-vig requires both sides — rows with null away odds now skipped instead of producing false mismatches)
- `admin.html` — `clvCell()` tooltip: removed recomputed `cp/pp - 1` formula line that was inconsistent with cron's no-vig method; tooltip now shows placed odds, closing odds, and stored CLV with label "no-vig vs Pinnacle, stored by cron"
- `api/capture-closing-lines.js` — final summary log line: added `total_in_window=` and `needs_capture=` fields; FIX 4 was already structurally present, this adds the two missing counters

**Verified (pre-deploy, by hand):**
- FIX 2 — Giants sign convention: placed=+106, closing=+116, closing_away=-127
  - decimalPlaced=2.06, rawClose=100/216=0.46296, rawCloseAway=127/227=0.55947, total=1.02243
  - fairProb=0.45282, fairDecimal=2.20832
  - CLV=(2.06−2.20832)/2.20832 = **−0.0672** ✓ Negative, matches stored value from session 7.
  - Sign convention is correct — no cron fix needed.
- FIX 4 — Summary log already existed; added `total_in_window` and `needs_capture` per audit spec.
- Deploy: `dpl_BjWftRSH1uzHb2unaLyKXSLVuFrG` — READY ✓

**Broken / unverified:**
- FIX 1 — verify-clv.js formula change not yet run against live DB. `clv_math_mismatch` count should drop to 0 once SQL backfill (session 9) is applied. Cannot confirm until `node scripts/verify-clv.js` is run.
- Nashville/Rockies CLV sanity check: need `closing_odds_away` from DB to complete. Query: `SELECT pick, odds_placed, closing_odds, closing_odds_away FROM bets WHERE closing_odds IS NOT NULL`.
- Additional audit check 6 (pick.odds vs bets.odds_placed parity): requires live DB query — not yet run. Query: `SELECT p.odds, b.odds_placed, p.id FROM picks p JOIN bets b ON b.pick_id = p.id WHERE b.closing_odds IS NOT NULL;`
- Admin tooltip change: code-verified only, not browser-tested. Hover over a CLV cell to confirm tooltip shows new format.
- `americanToImpliedProb` and `americanFromImpliedProb` in verify-clv.js are now dead code (no longer called). Not removed — out of scope for this session.

**Next session starts with:**
1. Run SQL backfill from session 9 if not yet done
2. Run `node scripts/verify-clv.js` — expect `clv_math_mismatch: 0`
3. Run audit check 6 query above — report any `p.odds != b.odds_placed` discrepancies (do not fix yet)
4. Browser-test admin CLV tooltip on a row with captured closing odds

---

## 2026-04-17 (session 11) — MAGIC_TEST diagnostic logging deployed

**Goal:** Add targeted diagnostic logging to `capture-closing-lines.js` for tonight's Orlando Magic vs Charlotte Hornets game to diagnose 5.1% CLV capture rate.

**Files changed:**
- `api/capture-closing-lines.js` — added 5 MAGIC_TEST injection points:
  1. After window calculation: logs if Magic game is outside the [now−2h, now+30min] window and how many mins until it enters
  2. After `alreadyCapturedIds` built: logs if Magic pick is in-window and about to query Pinnacle, or already captured
  3. After Pinnacle API response: logs what event Pinnacle returned (or nothing)
  4. After successful `bets` UPDATE: logs closing odds and CLV value written
  - Constants: `MAGIC_PICK_ID = 'a0ed3b6f-576e-46f4-8b12-447e1670543e'`, `MAGIC_GAME_TIME = 2026-04-17T23:40:00Z`

**Verified:**
- Deploy: `dpl_HDcBrzTaBab13e3y31g75NWmu1P7` — READY ✓
- grep confirmed all 5 injection points present in source before deploy

**Broken / unverified:**
- 5.1% capture rate: HYPOTHESIS (not confirmed) is Pinnacle feed timing — markets may be removed before window opens
- Magic game test will confirm or deny tonight — window opens ~23:10 UTC (7:10 PM ET)
- Window: [now−2h, now+30min], game_id exact-match confirmed working in code
- Fix decision pending full Magic test sequence tonight

**Next session starts with:**
1. Pull Vercel logs for cron runs between 23:00–00:30 UTC: `vercel logs --environment=production dpl_HDcBrzTaBab13e3y31g75NWmu1P7 | grep MAGIC_TEST`
2. Interpret log sequence to confirm whether Pinnacle had the event in-feed during the window
3. If capture succeeded: root cause is timing, fix window or cron frequency
4. If Pinnacle returned nothing: root cause is market removal before window, need earlier capture strategy
5. Then: run session 9 SQL backfill and `node scripts/verify-clv.js`

---

## 2026-04-17 (session 10) — Disable capture-closing-odds.js, single CLV writer enforced

**Goal:** Permanently disable `capture-closing-odds.js` and establish `capture-closing-lines.js` as the sole authorized CLV writer.

**Files changed:**
- `api/capture-closing-odds.js` — replaced entire 268-line file with a 6-line 410 tombstone handler. Returns `{ error: 'Deprecated', message: '...' }`. File kept so Vercel does not 404 if the route is called.
- `.claude/skills/capy-gotchas.md` — added `# ⚠️ CRITICAL ARCHITECTURE RULE` block at the very top: only `capture-closing-lines.js` authorized to write CLV; `capture-closing-odds.js` disabled; `closing_odds_captured_at` flagged as unreliable legacy column.

**Verified:**
- Deploy: `dpl_FgNCHU6J7Zn5L4KZ9HBy3oFB1xjt`
- `curl https://www.getcapy.co/api/capture-closing-odds` → HTTP 410 + `{"error":"Deprecated","message":"This endpoint is disabled. CLV capture is handled exclusively by /api/capture-closing-lines"}` ✓
- `capture-closing-lines.js` remains the only scheduled CLV cron (every 15 min in vercel.json) ✓

**Architecture state after this session:**
- Single CLV writer: `capture-closing-lines.js` (every 15 min, no-vig formula)
- `capture-closing-odds.js`: 410 tombstone, unscheduled, no CLV logic
- `closing_odds_captured_at`: legacy column, not written by the active cron, do not use as consistency signal

**Broken / unverified:**
- SQL backfill for 3 historical CLV rows still not run (from session 9)
- `verify-clv.js` not re-run post-backfill
- `capture-closing-lines.js` CLV formula (no-vig) not yet reconciled with the canonical implied-probability definition in `capy-math.md`

**Next session starts with:**
1. Run the session 9 SQL backfill in Supabase SQL Editor
2. Run `node scripts/verify-clv.js` — expect 0 `clv_math_mismatch`
3. Decide: reconcile `capture-closing-lines.js` no-vig formula to canonical implied-prob, or document the no-vig formula as the intentional production definition

---

## 2026-04-17 (session 9) — CLV formula standardized on implied probability

**Goal:** Enforce a single, explicit CLV formula across the entire codebase. Remove all decimal odds ratio language.

**Background:** Decimal ratio `(placed - closing) / closing` is algebraically equivalent to implied probability ratio `(closingProb / placedProb) - 1` only when using correctly-converted decimal odds. In practice the `decimal_odds` DB column diverged from `amToDecimal(odds_placed)`, causing silent wrong values. The equivalence was not safe to rely on.

**Files changed:**
- `api/capture-closing-odds.js` — removed `amToDecimal`. Added `americanToImpliedProb`. Replaced `(placedDecimal - closingDecimal) / closingDecimal` with `(closingProb / placedProb) - 1`. Updated header comment and inline comment.
- `scripts/verify-clv.js` — renamed `impliedProbFromAmerican` arrow function to `americanToImpliedProb` function declaration (exact spec implementation). Updated call sites and comment.
- `.claude/skills/capy-math.md` — replaced entire CLV section. Removed both previous implementations, removed all `amToDecimal`/decimal-ratio language. New section: canonical `americanToImpliedProb` definition + three worked examples as permanent reference.
- `.claude/skills/capy-gotchas.md` — added explicit gotcha: implied prob ratio is the formula, decimal ratio is not a safe substitute. Updated stale "unresolved" entries.

**SQL backfill (user to run in Supabase):**
```sql
UPDATE bets
SET clv = ROUND(
  (
    (CASE WHEN closing_odds > 0 THEN 100.0/(closing_odds+100) ELSE -closing_odds::numeric/(-closing_odds+100) END)
    /
    (CASE WHEN odds_placed > 0 THEN 100.0/(odds_placed+100) ELSE -odds_placed::numeric/(-odds_placed+100) END)
    - 1
  )::numeric, 4
)
WHERE closing_odds_captured = true
  AND closing_odds IS NOT NULL
  AND odds_placed  IS NOT NULL;
```

**Verified (pre-deploy sanity check):**
- Giants +106/+116: `(100/216)/(100/206)−1` = −0.0463 ✓
- Nashville +105/+114: `(100/214)/(100/205)−1` = −0.0421 ✓
- Rockies +148/+139: `(100/239)/(100/248)−1` = +0.0377 ✓

**Broken / unverified:**
- `capture-closing-lines.js` (ACTIVE cron) still uses no-vig formula — produces different CLV values. Reconciliation pending.
- SQL backfill not yet run — 3 historical rows still have old values until user runs it.
- No new capture run post-deploy to confirm formula fires correctly.

**Next session starts with:**
1. Run SQL backfill in Supabase SQL Editor
2. Run `node scripts/verify-clv.js` — expect 0 `clv_math_mismatch` after backfill
3. Paste next cron log to diagnose the 5.1% capture rate (skip-reason logging is live from session 8)

---

## 2026-04-17 (session 8) — CLV formula fix, capture audit logging, admin PICKED AT column

**Goal:** Fix CLV math mismatch (all 3 stored bets wrong), add per-bet skip logging to diagnose 5.1% capture rate, add PICKED AT column to admin.

**Files changed:**
- `api/capture-closing-odds.js` — (A) replaced `bet.decimal_odds` with `amToDecimal(bet.odds_placed)` in CLV formula; `decimal_odds` column diverged from actual placed odds, causing all 3 stored CLV values to be wrong. (B) refactored `findPinnacleMatch` to return `{ match, skipReason, debugInfo }` instead of bare null — caller now logs reason + pick/sport/game_time/id for every skipped bet. Five skip reasons: `empty_pinnacle_feed`, `no_game_in_time_window` (with closest game + diff), `team_name_not_found_in_window` (with full window game list), `no_h2h_market_on_matched_game`, `no_price_for_side`.
- `admin.html` — (C) added PICKED AT column (second, after CLV CAPTURED) showing `observed_at` in Vegas time via new `fmtDtVegas` helper; colspan updated 15→16 everywhere; `observed_at` added to unified row for bets-sourced rows.

**Verified:**
- Deployed successfully: `dpl_4PztbEDFunB6D3ELQ8CqTuqPWjdu`
- Fix A math: stored=0.0157 vs expected=0.0377 for Colorado Rockies (+148 placed, +139 closing). New formula: `amToDecimal(148) = 2.48`, `amToDecimal(139) = 2.39`, CLV = (2.48−2.39)/2.39 = 0.0376 ✓
- Fix B code: `findPinnacleMatch` returns structured object; caller logs SKIP lines — confirmed by file read
- Fix C code: `fmtDtVegas` with `timeZone: 'America/Los_Angeles'`; `observed_at` in bets rows; header "Picked At" at position 2; colspan=16 at 4 sites

**Broken / unverified:**
- Fix A: 3 existing wrong CLV rows still in DB (historical). New captures correct going forward. Historical rows need manual backfill if needed.
- Fix B: No real cron run yet — skip reason distribution still unknown.
- Fix C: Admin not browser-tested; most PICKED AT cells will show "—" until `observed_at` is populated on future picks.

**Next session starts with:**
1. Paste next Vercel log from `capture-closing-odds` cron — look for `SKIP` lines and identify dominant reason
2. If `no_game_in_time_window`: check whether stored `game_time` matches Odds API `commence_time` format
3. If `team_name_not_found_in_window`: compare `bet.pick` vs Pinnacle `home_team`/`away_team` — likely name normalization issue
4. Run `node scripts/verify-clv.js` after next real capture to confirm CLV math is now correct

---

## 2026-04-16 (session 7) — resolve stale pending bets, sharp cap removal, void schema, get-stats audit

**Goal:** Resolve stale pending bets, remove Sharp cap, fix check-results archived filtering, add void to schema, audit get-stats.js.

**Files changed:**
- `api/check-results.js` — skip archived picks at DB level (`.eq('archived', false)`) + in-memory guard
- `api/save-picks.js` — removed `SHARP_MAX_DAILY = 6`, `DAILY_TOTAL_LIMIT = 7`, early-exit block, and sharpSlots enforcement
- `api/get-stats.js` — two void-exclusion fixes:
  - `handleRecord`: `.neq('outcome','pending')` → `.in('outcome',['win','loss','push'])`
  - `handleStats`: `b.result !== 'pending'` → `['win','loss','push'].includes(b.result)`

**Verified:**
- Stale NBA/boxing bets manually resolved in Supabase:
  - Timberwolves ×2 → WIN
  - Bulls ×2 → LOSS
  - Warriors → LOSS
  - Boxing ×2 → PUSH
  - Karine Silva duplicate → PUSH
- Sharp daily cap removed — cron will now save all qualifying sharp picks
- check-results.js confirmed skipping archived picks at DB level
- get-stats.js void exclusion confirmed — no remaining `neq('pending')` or `result !== 'pending'` patterns
- `void` added to `bets_result_check` constraint in Supabase SQL editor
- `node scripts/verify-clv.js` run — output:
  - 1 of 44 settled bets have CLV data (capture rate 2%) — expected, others predate cron
  - `n < 30` guard on record.html working correctly
  - 1 CLV math mismatch: stored=−0.0672, script expects=−0.0463
  - 1 capture in `before_2h` bucket — cron capturing too early, not true closing line

**Broken / unverified:**
- CLV math mismatch: stored=−0.0672 vs expected=−0.0463. Root cause unknown — may be no-vig formula vs single-sided comparison, or pinnacle odds mismatch at capture time. Do not assume this is the same bug as the timing issue.
- Capture timing wrong: the 1 captured bet is in the `before_2h` bucket — cron window is firing too early and capturing a stale line, not the actual closing line. Ideal bucket is `between_0_30m`.
- These two issues may share a root cause (early capture → stale line → math appears mismatched). Confirm timing first before investigating math.

**Next session starts with:**
1. Open `api/capture-closing-odds.js` — paste the window logic and exact CLV formula here before touching anything
2. Fix window to capture 0–20 min before `game_time` only
3. Re-run `node scripts/verify-clv.js` after next day's games — confirm timing bucket moves to `between_0_30m`
4. Only then investigate math mismatch — it may resolve itself once capture timing is correct

---

## 2026-04-16 (session 6) — void result support

**Goal:** Add 'void' to bets result constraint; exclude void from all stat calculations.

**Files changed:**
- `api/get-stats.js` — two fixes to exclude void from resolved stats:
  1. `handleRecord` line 83: `.neq('outcome','pending')` → `.in('outcome',['win','loss','push'])`
     Void results are now excluded from activeResults and all downstream calcStats calls
     (winRate, roiUnits, roiFlat, avgEV, avgCLV).
  2. `handleStats` line 286: `b.result !== 'pending'` → `['win','loss','push'].includes(b.result)`
     Void bets no longer land in `resolved`, so they are excluded from overall, byPickType,
     bySport, byEvBucket, and stake/profit ROI calculations.
  - `settledWithClv` (line 397) already explicitly listed win/loss/push — no change needed.
  - `pendingPicks` filter already excluded void (void picks have a result row with outcome='void',
    so the `!p.results?.length` check fails) — no change needed.

**Task 1 — Supabase DDL (NOT yet run by Claude):**
Claude cannot execute DDL via the REST API. User must run in Supabase SQL Editor:
```sql
ALTER TABLE bets DROP CONSTRAINT bets_result_check;
ALTER TABLE bets ADD CONSTRAINT bets_result_check
  CHECK (result = ANY (ARRAY['win','loss','push','pending','void']));
```
Until this is run, inserting result='void' will fail at the DB level.

**Verified:**
- Deployed successfully
- `GET /api/get-stats?type=record` smoke test: total=33, wins=14, losses=19, pushes=0
  (no void rows in DB yet, so counts unchanged — correct)
- Grep confirms no remaining `neq('pending')` or `result !== 'pending'` patterns in get-stats.js

**Broken / unverified:**
- Supabase constraint not yet applied — void inserts will fail until user runs the DDL
- No void rows exist yet to verify the exclusion logic end-to-end

**Next session starts with:**
1. Confirm user ran the Supabase DDL and verify with: `INSERT INTO bets (result,...) VALUES ('void',...)` round-trip test OR check Supabase table editor constraint list
2. Then: diagnose duplicate pick rows (Boston Celtics / New York Knicks appear resolved in results table but still show as pending in get-stats — likely two picks with same game_time saved on different days)

---

## 2026-04-16 (session 5) — check-results fixes + sharp cap removal

**Goal:** Widen scores lookback, skip archived picks, remove Sharp daily cap of 6.

**Files changed:**
- `api/check-results.js` — three changes:
  1. DB query: added `.eq('archived', false)` to picks fetch — boxing/MMA/rugby no longer
     consume API credits or clog the pending queue
  2. In-memory guard: `unresolved` filter also checks `&& !p.archived` (defense-in-depth)
  3. `daysFrom=3→7` attempted then REVERTED (see Broken section)
- `api/save-picks.js` — removed Sharp daily cap:
  - Deleted `SHARP_MAX_DAILY = 6` constant
  - Deleted `DAILY_TOTAL_LIMIT = 7` constant
  - Deleted early-exit block that returned when `todayAll >= DAILY_TOTAL_LIMIT`
  - Replaced `sharpPool.slice(0, sharpSlots)` with `sharpPool` (all qualifying sharps saved)
  - `LONGSHOT_MAX_DAILY = 1` and all EV/quality filters unchanged

**Verified:**
- Deployed to production (dpl_2m6mDHdaSh1JUEsQFkUhRbMxuasW then dpl_rdmjlv6gg)
- Triggered Check Results Now three times. Second run resolved **3 NBA picks via BallDontLie**:
  - Boston Celtics (2026-04-12) → **WIN** (longshot)
  - New York Knicks (2026-04-12) → **LOSS** (longshot)
  - Philadelphia 76ers (2026-04-15) → **WIN** (sharp)
- Total resolved in results table: 33 picks (3 new this session)

**Broken / unverified:**

**Fix 1 (daysFrom) is REVERTED and still broken:**
- `daysFrom=7` returns HTTP 422 `INVALID_SCORES_DAYS_FROM` from The Odds API.
  The API max is 3 days regardless of plan. Reverted to `daysFrom=3`.
- This means MLB/NHL picks older than 3 days **cannot resolve via Odds API**.
  Picks from Apr 13 are on the edge (3 days ago); Apr 12 and earlier are permanently
  unreachable via the scores endpoint.
- Alternative needed: manual result entry for old picks, or a different scores source.

**BallDontLie 429 rate limit:**
- BDL hits HTTP 429 "Too many requests" when check-results makes sequential date
  fetches for many NBA dates in one invocation. A run with 10+ unique NBA dates
  (14-day window × 3 per pick = many calls) exhausts the BDL free tier rate limit
  immediately.
- NBA picks from Apr 12-15 unresolved because BDL 429 on all dates in the third run.
  May resolve on next cron invocation if rate limit resets between runs.

**Still pending (20 picks from get-stats as of this session):**
| Sport | Pick | Game Time | Pick Type |
|-------|------|-----------|-----------|
| icehockey_nhl | Nashville Predators | 2026-04-17T00:00:00 | sharp (future) |
| baseball_mlb | San Francisco Giants | 2026-04-16T16:41:00 | sharp |
| icehockey_nhl | Chicago Blackhawks | 2026-04-16T00:40:00 | sharp |
| baseball_mlb | Athletics | 2026-04-16T01:41:00 | sharp |
| baseball_mlb | New York Mets | 2026-04-16T02:11:00 | sharp |
| baseball_mlb | Minnesota Twins | 2026-04-15T17:41:00 | sharp |
| baseball_mlb | Seattle Mariners | 2026-04-16T01:41:00 | sharp |
| baseball_mlb | Kansas City Royals | 2026-04-15T22:41:00 | sharp |
| icehockey_nhl | Carolina Hurricanes | 2026-04-14T23:10:00 | sharp |
| icehockey_nhl | Philadelphia Flyers | 2026-04-14T23:10:00 | sharp |
| baseball_mlb | St. Louis Cardinals | 2026-04-14T23:45:00 | sharp |
| baseball_mlb | Washington Nationals | 2026-04-14T22:41:00 | sharp |
| basketball_nba | Philadelphia 76ers | 2026-04-15T23:30:00 | sharp |
| baseball_mlb | Athletics | 2026-04-14T01:41:00 | sharp |
| baseball_mlb | Washington Nationals | 2026-04-13T22:41:00 | sharp |
| basketball_nba | Chicago Bulls | 2026-04-13T00:40:00 | sharp |
| baseball_mlb | Minnesota Twins | 2026-04-13T23:41:00 | sharp |
| basketball_nba | Golden State Warriors | 2026-04-13T00:40:00 | sharp |
| basketball_nba | Boston Celtics | 2026-04-12T22:10:00 | longshot |
| basketball_nba | New York Knicks | 2026-04-12T22:10:00 | longshot |

Note: Celtics, Knicks, and Sixers appear resolved in the results table (33 total) but still
show as pending in get-stats — likely duplicate pick rows saved on different days for the
same game. Worth investigating in Supabase: `SELECT id, pick, game_time, created_at FROM picks WHERE pick IN ('Boston Celtics','New York Knicks','Philadelphia 76ers') ORDER BY game_time, created_at`.

**Next session starts with:**
1. Diagnose pending-despite-resolved: run the SQL above in Supabase to check for duplicate picks
2. Decide approach for MLB/NHL picks older than 3 days (manual resolve or accept as unresolvable)
3. Decide approach for BDL 429: add delay between date fetches, reduce date window, or batch NBA by fewer unique dates per run
4. Verify overnight cron saves more than 6 sharp picks now that cap is removed

---

## 2026-04-16 (session 4) — Cron verification + migration backfill fix

**Goal:** Verify cron update block is correct; fix migration backfill contamination.

**Files changed:**
- `migrations/add_closing_odds_captured_at.sql` — commented out the UPDATE backfill
  block that set `closing_odds_captured_at = observed_at`

**Verified:**
- Cron `api/capture-closing-odds.js` UPDATE block confirmed correct verbatim:
  5 fields — `closing_odds`, `closing_odds_away`, `closing_odds_captured`,
  `closing_odds_captured_at: new Date().toISOString()`, `clv`. Column names correct.
- Admin fixes from session 3 confirmed working: timestamp rendering bug fixed,
  CLV CAPTURED + CLOSING columns added, CLV math tooltip added, dark mode added.

**Resolved:**
- Migration backfill block (SET closing_odds_captured_at = observed_at) commented out.
  The Giants bet's closing_odds_captured_at was contaminated by this backfill —
  it shows observed_at (placement time) not the real capture time. Accepted as a
  one-time historical artifact; game has already started so cannot re-capture.
  Going forward, all new captures will have real timestamps from the cron.

**Broken / unverified:**
- verify-clv.js not yet run — waiting for overnight cron to accumulate captures
  with the corrected code (right column names + closing_odds_captured_at).
- Giants bet closing_odds_captured_at is permanently set to observed_at (artifact).

**Next session starts with:**
1. Run `node scripts/verify-clv.js` after overnight cron runs — check timing audit
   section shows captures in the 0–30 min before game start bucket
2. Book name casing normalization (BetOnline.ag etc.)
3. Investigate "no id" Texas Rangers pick

---

## 2026-04-16 (session 3) — Admin page fixes: timestamps, columns, dark mode

**Goal:** Fix UTC timestamp display bug in admin; add CLV Captured + Closing columns;
add CLV math tooltip; add dark mode toggle.

**Files changed:**
- `admin.html` — all 5 fixes below
- `record.html` — Fix 1 applied (same parseTs normalization for observed_at display)

**Fix 1 — Timestamp bug (CRITICAL):**
Root cause: Supabase returns `timestamptz` as `'2026-04-16 15:42:27+00'` (space
separator, bare `+HH` offset). V8's `new Date()` ignores the `+00` when the space
is present, treating 15:42 as LOCAL time. User in Las Vegas (PDT, UTC-7) sees
"3:42 pm" instead of "8:42 am". Fix: added `parseTs()` helper that normalizes to
valid ISO 8601 (`space → T`, `+00 → +00:00`) before calling `new Date()`.
- admin.html: new `parseTs()` + `fmtDt()` updated to use it
- record.html: same `parseTs()` + `fmtDate()`/`fmtTime()` updated
- game_time from Odds API (`'2026-04-17T01:10:00Z'`) is unaffected — the replace
  is a no-op and the regex doesn't match `Z`.

**Verified (code-level):**
`'2026-04-16 15:42:27+00'` → `parseTs` → `'2026-04-16T15:42:27+00:00'`
→ `new Date()` → 15:42 UTC → browser PDT conversion → 8:42 AM → "Apr 16 · 8:42 am"
Needs Sunny to verify in browser with the actual data.

**Fix 2 — CLV Captured column:**
Was showing `created_at` (bet placement time) as "Captured At". Now shows
`closing_odds_captured_at` if non-null, else "—". Renamed to "CLV Captured".
Added `closing_odds_captured_at` field to `buildUnified()` from bets data.

**Fix 3 — Closing column:**
Added "Closing" column between Odds and EV%. Shows `closing_odds` in American
format (+116, -127). Added `closing_odds` to `buildUnified()`. Colspan updated
14 → 15 in all 4 places.

**Fix 4 — CLV math tooltip:**
Hover over any CLV value to see: Placed odds + implied prob, Closing odds + implied
prob, CLV formula with actual numbers. Uses `impliedProb()` helper. Formula matches
`api/capture-closing-odds.js`: `implied_prob(closing) / implied_prob(placed) - 1`.
Example for Giants bet (placed +106, closing +116):
  Placed: +106 (implied 48.54%)
  Closing: +116 (implied 46.30%)
  CLV = 46.30% / 48.54% − 1 = −4.62%

**Fix 5 — Dark mode:**
Toggle button (🌙/☀) in admin nav. Warm dark palette:
  bg #1a1612, surface #221e18, surface-2 #2a241e, amber accents, green #22C55E.
CSS on `html.dark` (not body) so the <head> script can add it before paint.
Persists in `localStorage.capy_admin_dark`. No other pages affected.

**Broken / unverified — needs browser check:**
- Fix 1: Sunny must confirm timestamps now show Vegas time (test with a known
  bet's observed_at from Supabase)
- Fix 2: CLV Captured column will show "—" for all rows until migration is applied
  and the cron runs once (closing_odds_captured_at column doesn't exist yet in DB
  unless migration was run). Will show a Supabase error if column truly doesn't exist —
  check Vercel logs. WORKAROUND: if migration not yet applied, the column is just
  absent from the response and will be `undefined` → displays as "—" (safe).
- Fix 3: Closing column shows "—" for all but the 1 bet with captured closing odds.
  That bet (Giants, session 1) should show "+116".
- Fix 4: Tooltip only visible on desktop (title attribute, no mobile fallback).
- Fix 5: Confirm toggle persists after page reload.

**Next session starts with:**
1. Sunny verifies timestamps in browser
2. Sunny checks Closing column shows +116 for the Giants bet
3. Sunny confirms dark mode persists on reload
4. Book name casing (BetOnline.ag etc.) — separate session as noted
5. "No id" pick investigation — separate session

---

## 2026-04-16 (session 2) — CLV pipeline fix + record.html guard

**Goal:** Apply all fixes diagnosed in session 1: column name corrections in the
cron, closing_odds_captured_at timestamp, CLV aggregate guard in record.html.

**Files changed:**
- `scripts/verify-clv.js` — moved from zip; fixed env var `SUPABASE_SERVICE_ROLE_KEY`
  → `SUPABASE_SERVICE_KEY` to match `.env.local`; fixed dotenv path to `.env.local`
- `migrations/add_closing_odds_captured_at.sql` — moved from zip (SQL provided to
  user; not applied yet — requires manual run in Supabase SQL editor)
- `CLAUDE.md` — appended authoritative schema + CLV pipeline docs + Claude rules from
  `CLAUDE_md_additions.md`
- `SESSION_LOG.md` — this file moved from zip to project root; this entry appended
- `api/capture-closing-odds.js` — fixed wrong column names (`closing_odds_final` →
  `closing_odds`, `closing_odds_final_away` → `closing_odds_away`); removed nonexistent
  `true_clv` field from update; added `closing_odds_captured_at: new Date().toISOString()`
- `api/get-stats.js` — added `settledClvCount` (win/loss/push bets with CLV) to
  `closingLineStats` response; added `settledWithClv` filter using explicit result values
- `record.html` — added n<30 guard on CLV aggregate section: shows "collecting data —
  N bets tracked" message when `settledClvCount < 30`; stats display when ≥ 30

**Verified:**
- Code changes reviewed against schema in CLAUDE.md — column names confirmed correct
- Cron window logic reviewed: actual window is 0 → +20 min before game start (NOT the
  "2h before → 30min after" written in session 1 — that was inaccurate). Window is correct;
  only 1 pick found because only 1 game was starting within the window that day.
- `dotenv` confirmed missing from package.json — user must run `npm install dotenv`

**Broken / unverified:**
- Migration `add_closing_odds_captured_at.sql` NOT yet applied — user must run in Supabase
- `api/capture-closing-odds.js` fix NOT yet deployed to Vercel (column names were wrong
  before; previous successful capture with correct data may have used an older code version
  or Supabase silently skipped unknown columns for those fields)
- `node scripts/verify-clv.js` NOT yet run — waiting on migration + deploy
- CLV aggregate on record.html will show "0 settled bets tracked" until new picks accumulate
  closing odds (expected behavior post-fix)
- The 1 previously captured CLV row: if it was captured with wrong columns, `closing_odds`
  may already be correct (confirmed in session 1 Supabase query) but `closing_odds_captured_at`
  will be backfilled to `observed_at` by the migration (rough proxy, not accurate)

**Resolved after session ended:**
- Cron window (0 → +20 min) confirmed correct via picks table query — 4 picks in next 24h
  matches observed "1 pick per window" behavior. Not a bug.

**Next session starts with:**
1. Confirm user ran migration in Supabase SQL editor
2. Confirm deploy to Vercel (`git push` or Vercel dashboard)
3. Run `node scripts/verify-clv.js` and paste output (Step 7 from instructions)
4. Monitor next cron run in Vercel logs — confirm log shows correct column names
   (`closing_odds` not `closing_odds_final`) and `closing_odds_captured_at` is written
5. If CLV math mismatch anomalies appear in verify-clv.js output, investigate formula

---

## 2026-04-16 — CLV pipeline audit

**Goal:** Figure out why record.html CLV wasn't working; set up infrastructure
to prevent future silent failures.

**Files changed:**
- `scripts/verify-clv.js` — new local audit script, prints counts + anomalies + timing
- `migrations/add_closing_odds_captured_at.sql` — new column for timing audits
- `CLAUDE.md` — added authoritative schema, column name corrections, verification rules
- `SESSION_LOG.md` — new file (this one)

**Verified:**
- Cron `api/capture-closing-odds.js` IS running (Vercel logs show successful run
  at 16:15:01 UTC, captured closing odds for Giants bet `32c07d8f-...`).
- The capture wrote correct data: odds_placed=+106, closing_odds=+116,
  closing_odds_away=-127, clv=-0.0672. Math reconciles.
- Schema verified via information_schema query — actual column names are
  `closing_odds`, `closing_odds_away`, `clv`, `observed_at` (NOT the
  `_final` / `true_` variants that were in old notes).

**Broken / unverified:**
- Only 1 of 51 historical bets has CLV data. The other 50 were placed before
  the cron was working and will NEVER have closing odds. Going forward,
  every new pick should accumulate closing data.
- `closing_odds_captured_at` column does not yet exist — migration written
  but not yet applied. Cannot audit capture TIMING until applied.
- `api/capture-closing-odds.js` not yet updated to write to the new timestamp
  column.
- record.html may still be displaying misleading CLV aggregate from n=1.
  Needs to be updated to either hide CLV until n>=30 or show "n=1" qualifier.
- Cron window logic (2h before → 30min after?) not reviewed. Found only
  1 pick in a 2.5h window; may be filtering too narrowly.
- record.html `result IS NOT NULL` filter is too permissive — 'pending'
  counts as non-null. Should filter `result IN ('win','loss','push')`.

**Next session starts with:**
1. Apply `migrations/add_closing_odds_captured_at.sql` in Supabase SQL editor
2. Update `api/capture-closing-odds.js` to set `closing_odds_captured_at = NOW()`
   when it writes closing_odds (find the UPDATE statement and add the field)
3. Install script deps: `npm install @supabase/supabase-js dotenv`
4. Run `node scripts/verify-clv.js` to confirm baseline
5. Fix record.html: hide CLV aggregate when n<30, fix settled-filter to exclude 'pending'
6. Review cron window logic in `api/capture-closing-odds.js` — is 2h→30min the right window?

---
