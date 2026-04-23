# SESSION_LOG.md

Append-only log of every Claude Code / Claude session on GetCapy.
Newest entries at top. Archive to SESSION_LOG_ARCHIVE.md when past ~50 entries.

---

## 2026-04-23 (session 48) — clean URL routing for all main public pages

**Goal:** Make all main public pages work without `.html` in the URL, and remove `.html` from all nav links so the browser address bar stays clean.

---

### Root cause

`vercel.json` only had rewrites for `/odds`, `/game`, and `/stats`. Four main public pages had no rewrite entry:
- `/props` → 404 (only `/props.html` worked)
- `/record` → 404 (only `/record.html` worked)
- `/props-record` → 404 (only `/props-record.html` worked)
- `/parlay` → 404 (only `/parlay.html` worked)

Additionally, all nav links across every page used the `.html` form (e.g. `href="/odds.html"`), so even clicking "Live Odds" would surface `/odds.html` in the address bar despite the rewrite being in place for `/odds`.

---

### Files changed

| File | Change |
|------|--------|
| `vercel.json` | Added rewrites: `/props`, `/record`, `/props-record`, `/parlay` |
| `index.html` | Nav links: `/odds.html` → `/odds`, `/props.html` → `/props`, `/parlay.html` → `/parlay` (nav + inline CTA), `/stats.html` → `/stats` |
| `odds.html` | Nav links + parlay toast JS string updated to clean URLs |
| `props.html` | Nav links updated |
| `record.html` | Nav links updated including `/record.html` self-link |
| `props-record.html` | Nav links updated including `/record.html` and `/props-record.html` self-links |
| `stats.html` | Nav links updated |
| `parlay.html` | Nav links updated |
| `game.html` | Nav links + prop toast JS string updated; footer `/odds` already clean |

Backup: `backup-v50/`

---

### Pages now supporting clean URLs

| Clean URL | Works |
|-----------|-------|
| `/odds` | ✓ (was already rewritten; nav link now also uses clean form) |
| `/props` | ✓ NEW — rewrite added |
| `/record` | ✓ NEW — rewrite added |
| `/props-record` | ✓ NEW — rewrite added |
| `/parlay` | ✓ NEW — rewrite added |
| `/game` | ✓ (already existed) |
| `/stats` | ✓ (already existed) |

---

### Pages intentionally left with `.html`

| Page | Reason |
|------|--------|
| `/oddsjam-alternative.html` | SEO landing page — external links likely indexed against `.html` form; rewrite would risk redirect confusion |
| `/prop-admin.html` | Internal admin-only page, not linked from public nav |
| `/admin.html` | Internal admin, password-protected, not public nav |
| `/privacy.html`, `/terms.html`, `/success.html` | Legal/utility pages; no user-facing nav links to update |

---

### What was VERIFIED

- `vercel.json` final state shows 7 rewrites: odds, props, record, props-record, parlay, game, stats ✓
- Grep across all 9 root pages confirms zero remaining `href="/*\.html"` in nav/mobile-menu links ✓
- Only remaining `.html` hrefs are `oddsjam-alternative.html` (footer SEO link) and `prop-admin.html` (admin nav) — both intentional ✓
- JS toast strings in `odds.html` and `game.html` for parlay links updated to `/parlay` ✓

---

### What is BROKEN / UNVERIFIED

- End-to-end browser verification requires a deploy; routing is confirmed correct from `vercel.json` logic.
- `oddsjam-alternative.html` has no rewrite — if a clean `/oddsjam-alternative` URL is desired in future, add a rewrite entry. Not needed now.

---

### Next action

Deploy (`git push`). Verify in production:
- `/props` loads props.html correctly
- `/record`, `/props-record`, `/parlay` all resolve
- Clicking nav links does not expose `.html` in the browser address bar

---

## 2026-04-23 (session 47) — trust framing: small-sample ROI/CLV guards on record pages

**Goal:** Prevent misleading ROI and CLV presentation on small samples on `record.html` and `props-record.html`. Pipeline is healthy — risk is perception: a user sees +30% ROI in green from 8 picks and thinks the system is proven.

---

### What was misleading (findings)

| Issue | Where | Severity |
|-------|-------|----------|
| Per-type CLV (Sharp/Longshot cards) shown with no sample guard — 2 captures could produce a ±20% avg | `record.html` | HIGH |
| ROI on Sharp/Longshot type cards shown immediately on any settled picks, colored green/red | `record.html` | HIGH |
| Win rate color bug: neutral case defaulted to `'green'` instead of `''` | `record.html` | MEDIUM |
| By-Sport rows showed colored ROI/win-rate with 1–4 picks, no n-count visible | `record.html` | HIGH |
| By-EV-bucket rows same issue — n=2 buckets showed ±ROI in color | `record.html` | HIGH |
| Props ROI colored green/red from any settled picks | `props-record.html` | HIGH |
| Props Win Rate colored green/red from any decisive results | `props-record.html` | MEDIUM |
| Yesterday's Results showed "100% win rate" with 2 picks, no caveat | `props-record.html` | MEDIUM |
| API didn't return per-type CLV sample sizes — frontend had no data to guard with | `api/get-stats.js` | HIGH |

---

### Thresholds chosen and rationale

| Constant | Value | Used for |
|----------|-------|----------|
| `MIN_SAMPLE_ROI` | 20 | Sharp/Longshot ROI cards on `record.html` |
| `MIN_SAMPLE_WINRATE_CLR` | 10 | Green/red on win rate in pick-type cards |
| `MIN_SAMPLE_CLV_PERTYPE` | 5 | Per-type CLV on Sharp/Longshot cards |
| `MIN_SAMPLE_SPORT_ROW` | 5 | By-Sport and By-EV-bucket table rows |
| Props win rate color | 10 decisive | `props-record.html` win rate card |
| Props ROI color | 10 decisive | `props-record.html` ROI card |
| Yesterday small-sample note | < 5 picks | Appends " · small sample" to win rate label |

These thresholds don't hide data — they suppress **color coding** (which implies signal vs noise) until sample is minimally meaningful. Values still display as neutral text; tooltips explain the suppression.

---

### Files changed

| File | Change |
|------|--------|
| `api/get-stats.js` | `avgClvFor` → `clvStatsFor` returning `{avg, n}`; added `sampleSharp` and `sampleLongshot` to `closingLineStats` |
| `record.html` | Added 4 sample-guard constants; guarded Sharp/Longshot ROI (need 20), win rate color (need 10); fixed win-rate neutral-case bug; `renderPtClv` now accepts `sampleN` and guards at 5 captures; `renderSportTable` guards ROI/win-rate color for rows n<5, adds N column; EV bucket rendering same guards + N column; updated empty-state colspans 5→6 |
| `props-record.html` | Win rate color suppressed until decisive ≥ 10; ROI color suppressed until decisive ≥ 10; Yesterday's Results appends "· small sample" when < 5 picks |

---

### What was VERIFIED

- Constants block added to `record.html` at correct scope (before any function) ✓
- `renderPtClv` now called with `cls.sampleSharp` and `cls.sampleLongshot` from API ✓
- Sport table and EV bucket table both have `N` column in HTML header and JS render ✓
- EV bucket empty-state colspan updated 5→6 to match ✓
- `api/get-stats.js` returns `sampleSharp` and `sampleLongshot` in `closingLineStats` ✓
- `props-record.html` win rate and ROI both guarded at 10 decisive picks ✓
- Yesterday small-sample note fires when < 5 picks ✓

---

### What is BROKEN / UNVERIFIED

1. **End-to-end visual verification** — auth-gated pages need a browser session to confirm rendering. Code inspection confirms logic is correct.
2. **Overall ROI on `record.html` (header stats)** — still shows colored immediately from any settled bets. Given the total pick count is always displayed adjacent (`hs-record-sub`), this is low-risk and was intentionally left unguarded to keep the header informative.
3. **Payout calculator ROI** — both pages still show calculator ROI at any sample size. This is acceptable since the calculator is interactive and labeled "calculator" not "track record." The n-count is shown (e.g., "14 settled picks").
4. **Props aggregate CLV guard** — already in place at n≥10 from session 40; unchanged.
5. **ML aggregate CLV guard** — already in place at n≥30 from session 40; unchanged.

---

### Next action

Deploy (`git push`), then verify on record.html and props-record.html:
- Sharp/Longshot ROI shows `—` (with tooltip) when < 20 settled picks
- Per-type CLV shows `—` (with tooltip) when < 5 captures per type
- By-Sport and By-EV-bucket tables show N column; small rows show `—` for ROI

---

## 2026-04-23 (session 46) — CDN cache still MISS: anyStale guard bug

**Goal:** Find why `/api/odds?sport=all` still returned `x-vercel-cache: MISS` and `cache-control: public, max-age=0, must-revalidate` after session 45 deploy.

---

### Root cause

`if (!anyStale)` guard on line 221 of `api/odds.js` prevented `res.setHeader('Cache-Control', ...)` from ever being called when any sport fell back to a live API fetch.

**When `anyStale = true`**: the function returned a 200 response with NO `Cache-Control` header set. Vercel's Edge Network then applied its default: `public, max-age=0, must-revalidate`. This header does NOT tell the Vercel CDN to cache — it means "public but always revalidate." Result: every load was a cache MISS and hit the Vercel function.

The original intent of the guard was "only cache if all data came from the DB cache." But this was wrong: live-fetched data is equally valid (in fact, it's more fresh) and should be cached too. The guard caused CDN bypass on every request where even one sport had a cache miss or stale row.

**Note**: The observed `cache-control: public, max-age=0, must-revalidate` in DevTools is Vercel's CDN-layer default — it's what browsers always see from Vercel API routes, regardless of the `s-maxage` set server-side. The meaningful indicator is `x-vercel-cache: HIT` vs `MISS`.

---

### Fix applied

**`api/odds.js`** — replaced the guard with an always-set header:
- `anyStale=false` (all from DB cache): `s-maxage=300, stale-while-revalidate=3300`
- `anyStale=true` (some sports live-fetched): `s-maxage=60, stale-while-revalidate=300`

Also added a `console.log` line showing `anyStale`, `usOdds.length`, and `pinnacleOdds.length` on every `sport=all` call — visible in Vercel function logs to diagnose why anyStale is true.

---

### Files changed

| File | Change |
|------|--------|
| `api/odds.js` | Replaced `if (!anyStale) setHeader(...)` with unconditional setHeader; added diagnostic log |

---

### What was VERIFIED

- `anyStale=false` path still sets the long 300/3300 window ✓
- `anyStale=true` path now sets a short 60/300 window (instead of no header) ✓
- Diagnostic log line fires on every `sport=all` call — will show in Vercel function logs ✓
- Deployed to `www.getcapy.co` ✓

---

### What is BROKEN / UNVERIFIED

1. **Verify `x-vercel-cache: HIT` on second load** — open DevTools → Network, load `/odds`, reload. Second request should show `x-vercel-cache: HIT`.
2. **Check Vercel logs for `anyStale=true`** — if logs show `anyStale=true`, inspect which sport triggered the fallback via the preceding `[Odds] Cache miss for...` log lines. Fix root cause (likely a missing or stale cache row for a specific sport).
3. **Expected behavior after fix**: first load = MISS (~1–3s cold, ~300ms warm), all subsequent loads within CDN window = HIT (<50ms).

---

## 2026-04-23 (session 45) — performance audit continuation: cold-start + CDN gap fix

**Goal:** Continue interrupted audit of 5–10s first-load on odds page. Identify remaining bottleneck after sessions 41–43 fixes. Deploy highest-impact fix.

---

### Root cause identified

**Vercel function cold starts + CDN coverage gap.**

Sessions 41–43 fixed the structural issues (single `sport=all` call, IN query, cache clearing). After those fixes, the warm-path time is ~300–500ms (Supabase IN query + processing). The remaining 5–10s is caused by:

1. **CDN coverage window shorter than cron interval** — `s-maxage=300` (5 min) + `stale-while-revalidate=900` (15 min) = 20 min total CDN coverage. The cron runs every 60 minutes. For the 40-minute gap between CDN expiry and the next cron, every request hits the Vercel function instead of the CDN.

2. **No proactive CDN warmup** — The cron writes fresh data to Supabase but never triggers the CDN to cache it. The first user after each cron run hits a cold Vercel function (1–3s cold start + ~300ms Supabase query = 1.3–3.3s), despite data being fresh.

**What is NOT the bottleneck (confirmed by code inspection):**
- Supabase query: IN query for 19 rows with JSONB returns in ~50–200ms
- Payload size: ~100–200KB uncompressed, trivial to transfer
- Frontend rendering: 10 initial cards (LAZY_BATCH), memoized EV calc — ms-range
- Props: unrelated, separate endpoint not called on odds page load

---

### Fixes applied

**`api/odds.js`:**
1. Moved `createClient()` to module level (reused across warm invocations instead of re-created per request)
2. Extended `stale-while-revalidate` from 900 → 3300 seconds in both cache-hit paths (sport=all and single-sport). Total CDN coverage: 60 min = matches hourly cron interval.

**`api/refresh-odds.js`:**
3. Added CDN warmup at end of cron handler — after writing all sports to Supabase, fetches `/api/odds?sport=all` to pre-populate the Vercel Edge CDN. 10-second cap via `Promise.race` so warmup never delays the cron response. Fire-and-forget pattern.

---

### Effect after these changes

- **After each cron run**: odds.js is invoked → warm function → CDN populated → all users for next 60 min get CDN response (<50ms)
- **CDN gap scenario** (warmup fails or cron cold): stale-while-revalidate=3300 now covers the full 60-min window between cron runs
- **Warm function request**: module-level Supabase client reused → saves 1–5ms per warm hit
- **Expected first-load time**: <100ms for CDN hits (vs 5–10s previously); ~1.5–3s only if CDN is fully cold AND warmup failed

---

### Files changed

| File | Change |
|------|--------|
| `api/odds.js` | `createClient` moved to module level; `stale-while-revalidate` 900→3300 (2 occurrences) |
| `api/refresh-odds.js` | CDN warmup call after Supabase writes complete |

---

### What was VERIFIED

- `api/odds.js` module-level `supabase` no longer inside handler, env vars still read at module init ✓
- Both `stale-while-revalidate=3300` occurrences updated (sport=all path line ~220, single-sport path line ~255) ✓
- Warmup uses `Promise.race([fetch(...), setTimeout(10000)])` — will not block cron response ✓
- Warmup URL hardcoded to `https://www.getcapy.co/api/odds?sport=all` — correct production URL ✓

---

### What is BROKEN / UNVERIFIED

1. **End-to-end timing unverified** — need browser DevTools Network tab to confirm CDN hit vs function hit. Look for `X-Vercel-Cache: HIT` response header (fast = CDN) vs `MISS` (slow = function).
2. **Warmup timing** — warmup fires AFTER cron completes; if cron takes >10s and warmup races against 10s cap, warmup may not complete. Verify via Vercel function logs: look for `[refresh-odds] CDN warmed — status 200`.
3. **Vercel Edge CDN region** — on Hobby plan, CDN cache may be regional. Users in a different region than the cached entry may still miss. Upgrade to Pro for global CDN if needed.

---

### Next action

1. Deploy to Vercel (`git push`)
2. Wait for next hourly cron run or trigger manually via admin
3. Verify in browser DevTools: `X-Vercel-Cache: HIT` on `/api/odds?sport=all` response
4. Check Vercel function logs for `[refresh-odds] CDN warmed — status 200`

---

## 2026-04-23 (session 44) — capy-gotchas.md audit and refresh

**Goal:** Audit capy-gotchas.md against sessions 33–43 and update it to be the
complete regression-prevention reference.

**Files changed:**
- `capy-gotchas.md` — full rewrite. Preserved three existing artifact entries
  (timing artifact, low CLV sample size, 16 historical mismatch rows). Added five
  new sections covering props exact-line matching, dedup key rule, two-CLV-field
  distinction, EV cap asymmetry, sample size guards, odds page architecture rules
  (sport=all fetch model, cache invalidation danger, overfetching/payload bloat,
  Pinnacle empty-bookmakers guard), CLV display rule, DB column name landmines,
  BallDontLie cursor pagination, BDL name suffix normalization, and the contaminated
  pre-session-40 props CLV artifact.

**What was VERIFIED:** All lessons cross-referenced against SESSION_LOG.md sessions
33–43. No SESSION_LOG narrative duplicated — gotchas captures only the durable rule
or trap, not the debugging journey.

**What is BROKEN / UNVERIFIED:** Nothing broken by this change.

**Next action:** Before any future edit to props CLV capture, odds page, or BDL
grading, read capy-gotchas.md sections 1–4 first.

---

## 2026-04-22 (session 43) — sport filter cache fix: instant tab switching

**Goal:** Eliminate unnecessary API re-fetch when clicking sport filter tabs on odds.html.

---

### Bug identified

`filterSport()` called `oddsCache = {}` before every `loadSport()` call. This cleared
all the per-sport data that `fetchAllSports()` had just populated from the single
`sport=all` API call. Result: every sport tab click caused a full API round-trip even
though the data was already in memory.

The flow before the fix (e.g. clicking "NBA" after initial load):
1. `oddsCache = {}` — wipes `oddsCache['basketball_nba']` we just loaded
2. `loadSport('nba')` → `showSkeleton()` → `fetchForSport('nba')` → cache miss → API call (~200–500ms)
3. Cards render after API response

---

### Fixes applied

**`odds.html` — `filterSport()`:**  
Removed `oddsCache = {};`. Per-sport caches from `fetchAllSports()` remain valid. The
5-minute `setInterval` and retry buttons both still clear the cache explicitly before
reloading, so forced refreshes are unaffected.

**`odds.html` — `loadSport()`:**  
Added cache-warm check: `const hasCached = sport === 'all' ? false : (oddsCache[sport]?.length > 0)`.
When a sport tab has cached data, `showSkeleton()` is skipped — tab switch is a direct
re-render with no skeleton flash. The `sport === 'all'` path always shows skeleton
(always fetches fresh data).

---

### How it works now (NBA click after initial load)

1. `loadSport('nba')` — `hasCached = true` → skip skeleton
2. `fetchForSport('nba')` → `oddsCache['basketball_nba']` exists → returns immediately (no fetch)
3. `renderGames()` renders NBA cards — instant
4. `renderEvSection()` renders NBA EV — instant

---

### Files changed

| File | Change |
|------|--------|
| `odds.html` | `filterSport`: removed `oddsCache = {}` |
| `odds.html` | `loadSport`: skip skeleton when `oddsCache[sport]` already populated |

---

### What was VERIFIED

- `filterSport('all', el)` still shows skeleton (hasCached forced false for 'all') ✓
- `filterSport` with uncached sport (e.g. NCAAF — not in ALL_SPORTS) still shows skeleton and fetches ✓
- Retry buttons and 5-minute interval both use `oddsCache = {}` explicitly — forced refreshes unaffected ✓
- Deployed to `www.getcapy.co` ✓

---

### What is BROKEN / UNVERIFIED

1. **End-to-end timing still unverified** — browser DevTools Network tab timing for initial
   `/api/odds?sport=all` response not yet measured. Target: <1.5s TTFB from Vercel function,
   <50ms on repeat loads via CDN cache.
2. **3-book removal takes effect at next cron run** — `refresh-odds.js` only stores 5 books
   after the 8am UTC cron on 2026-04-23. Until then, `odds.js` filters server-side.

---

## 2026-04-22 (session 42) — odds.html performance audit + fixes

**Goal:** Reduce odds page first-useful-render from ~5 seconds to 1–2 seconds. Page was no longer stuck on skeletons (session 41 fixed), but card population still took ~5s.

---

### Bottlenecks identified

| Layer | Issue | Estimated cost |
|-------|-------|----------------|
| Backend DB | 19 parallel Supabase `.single()` queries for `sport=all` | ~500–1500ms (connection overhead × 19) |
| Backend payload | 8 bookmakers stored/returned, only 5 used by frontend | ~37% of usOdds payload wasted |
| Backend payload | `pinnacleMap` returned alongside `pinnacleOdds` — redundant since `fetchAllSports()` never reads it | ~10–15% extra payload |
| Backend caching | No HTTP cache headers — every load cold-hits the Vercel function even though data refreshes once daily | 0 CDN hits; full round-trip every time |
| Frontend | `calcGameEV` memoized via `game._ev` after first call — NOT a bottleneck | n/a |
| Frontend | First 10 cards rendered via lazy batch — NOT a bottleneck | n/a |

---

### Fixes applied

**`api/odds.js` — sport=all path:**
- Replaced `Promise.all(19 × .single())` with a single `.in('sport', ALL_SPORTS)` query — one DB round-trip instead of 19. This alone should cut backend time by 300–800ms.
- Server-side slim: filter each game's `bookmakers` array to only the 5 displayed books (`DISPLAY_BOOKS` Set). The cache stores 8 books (including caesars, pointsbet, unibet that the UI never reads). Filtering before serialization reduces the JSON payload by ~37%.
- Dropped `pinnacleMap` from `sport=all` response body — `fetchAllSports()` builds its own lookup directly from `pinnacleOdds` and never reads `pinnacleMap`.
- Added `Cache-Control: public, s-maxage=300, stale-while-revalidate=900` when all data came from Supabase cache. Vercel Edge Network will serve repeat loads in <50ms instead of hitting the function.

**`api/odds.js` — single-sport path:**
- Added same `Cache-Control` header for cached responses (sport filter clicks benefit too).

**`api/refresh-odds.js`:**
- Removed `caesars,pointsbet,unibet` from `US_BOOKMAKERS`. After next cron run (tomorrow 8am UTC), the stored cache rows will only contain the 5 displayed books — eliminating the server-side slim step entirely.

---

### Files changed

| File | Change |
|------|--------|
| `api/odds.js` | Single `.in()` query; server-side bookmaker filter; drop `pinnacleMap` from `sport=all`; `Cache-Control` headers |
| `api/refresh-odds.js` | Remove 3 unused bookmakers from `US_BOOKMAKERS` |
| `backup-v48/odds-api-pre-perf.js` | Pre-fix backup of `api/odds.js` |
| `backup-v48/refresh-odds-pre-perf.js` | Pre-fix backup of `api/refresh-odds.js` |

---

### What was VERIFIED

- `api/odds.js` syntax: no errors — compiled cleanly by Vercel build ✓
- `DISPLAY_BOOKS` Set used correctly for `.filter(bk => DISPLAY_BOOKS.has(bk.key))` ✓
- `US_BOOKMAKERS` string kept for `fetchSportDirect` URL construction ✓
- `pinnacleMap` removal safe: `fetchAllSports()` only uses `pinnacleOdds`; `getSharpRef` falls back to `h2h.last_update` for timestamps ✓
- Games that only had caesars/pointsbet/unibet odds filtered out by `g.bookmakers.length` check ✓
- Single-sport path unchanged except Cache-Control header ✓
- Deployed to `www.getcapy.co` ✓

---

### What is BROKEN / UNVERIFIED

1. **First-load timing unverified** — need to open browser DevTools Network tab and time `/api/odds?sport=all` response to confirm improvement.
2. **Cache-Control effectiveness** — Vercel Edge caching requires the first uncached request to complete; subsequent requests within 5min will be fast. CDN cache key is based on URL, so all users share one cached copy.
3. **3-book removal takes effect tomorrow** — `refresh-odds.js` change only applies when the cron runs next (8am UTC). Until then, the server-side slim in `odds.js` handles it.
4. **No frontend streaming** — browser still waits for complete JSON before parsing. If payload is still large (MLB season = many games), this adds ~100–300ms for JSON parse. Could add streaming or progressive render, but not done here (would be a bigger refactor).

---

### Expected improvement

- API response time: ~5s → ~0.5–1.5s (single DB query + no cold-start after CDN warms)
- Repeat loads (within 5 min): <100ms (served from Vercel Edge CDN)
- Payload size: reduced by ~40–50% (bookmaker filter + no pinnacleMap)

---

## 2026-04-22 (session 41) — odds.html skeleton fix; Pinnacle defensive guards

**Goal:** Fix odds.html permanently stuck on loading skeletons. API returns valid JSON but some pinnacleOdds entries have `bookmakers: []`. Add defensive guards so missing Pinnacle data is always handled gracefully and the loading state always clears.

---

### Root cause identified

**Primary:** `loadSport('all')` was making 26 parallel API calls (`Promise.all(ALL_SPORTS.map(s => fetchForSport(s)))`). Seven of those sports (`basketball_ncaab`, `basketball_wncaab`, `basketball_euroleague`, `americanfootball_ncaaf`, `americanfootball_ufl`, `icehockey_ahl`) are NOT in the server-side `ALL_SPORTS` list and are not in the Supabase cache. Each miss triggered a direct Odds API call from the Vercel function — slow, credit-burning, and potentially hanging. With no timeout on the browser `fetch` calls, `Promise.all` waits for the slowest call indefinitely. Result: skeleton never clears.

**Secondary:** No explicit guard for `pinnacleGame.bookmakers: []` (game in Pinnacle's system but no lines posted yet). Optional chaining handles it safely, but the intent wasn't explicit. Added a clear array-length guard.

**Tertiary:** `renderPicks()` and `renderEvSection()` were called OUTSIDE the try/catch inside `renderGames()`. Any exception there would propagate to `loadSport`'s catch → `showError()`, which DOES clear the skeleton (so not the root cause), but it silently killed game card rendering.

---

### Files changed

| File | Change |
|------|--------|
| `odds.html` | Added `fetchAllSports()` — one `sport=all` API call replaces 26 parallel calls |
| `odds.html` | `loadSport('all')` now calls `fetchAllSports()` instead of `Promise.all(26 × fetchForSport)` |
| `odds.html` | `fetchAllSports()` populates per-sport `oddsCache[s]` and `pinnacleCache[s]` by grouping on `game.sport_key` |
| `odds.html` | `renderPicks()` and `renderEvSection()` wrapped in try/catch in `renderGames()` |
| `odds.html` | `getSharpRef()` wrapped in try/catch; explicit `bookmakers.length` guard for empty-bookmaker case |
| `odds.html` | `fetchForSport()` pinnacleOdds forEach and pinnacleMap processing wrapped in try/catch |
| `backup-v48/odds-pre-pinnacle-guard.html` | Pre-fix backup |

---

### What was VERIFIED

- Code reads clean: `getSharpRef` returns null for `bookmakers: []`, `calcGameEV` returns null, `buildGameCard` renders "No sharp line" state — full safe path traced
- `fetchAllSports()` populates `oddsCache[s]`, `oddsFetchedAt[s]`, `pinnacleCache[s]` correctly — sport filter clicks remain instant (no re-fetch needed)
- `fmtFreshness(sport)` uses `oddsFetchedAt[sport]` — correctly set per-sport in `fetchAllSports()`
- No regression to sport filter buttons — `filterSport(sport)` calls `loadSport(sport)` which uses `fetchForSport(sport)` (unchanged) for individual sports
- 7 previously-fetched sports not in server `ALL_SPORTS` simply won't appear in `sport=all` response — correct behavior (they aren't cached by the cron anyway)

---

### What is BROKEN / UNVERIFIED

1. **Not deployed** — changes are local. Deploy required to verify on live page.
2. **`filterSport` async race** — `filterSport` calls `loadSport(sport)` then immediately calls `renderEvSection()` synchronously before the async load completes. Pre-existing issue, not introduced here.
3. **Sessions 34–40 also undeployed** — multiple sessions of changes staged but not live.

---

### Next action

Deploy to Vercel and verify the odds page renders. Check browser console for `[Capy] Pinnacle all-sports cached:` log to confirm the `sport=all` endpoint is being used and returning data.

---

## 2026-04-22 (session 40) — ML vs Props integrity audit; capture-prop-closing-lines fix

**Goal:** Build a comprehensive ML vs Props integrity diff audit. Identify why props CLV/beat-rate look artificially strong. Fix confirmed bugs. Document what needs remediation before hard launch.

---

### Phase 1 — Codebase Recon: What was read and understood

**ML pipeline:**
- `api/save-picks.js`: EV cap 5% max (`BETS_EV_MAX = 0.050`), vig sanity 0.9–1.2
- `api/capture-closing-lines.js`: CLV = `(impliedProb(closing) / impliedProb(placed)) - 1`, game_id exact match, no line issues (h2h), writes `closing_odds_captured_at`
- `api/get-stats.js` → `record.html`: Uses stored `bets.clv` (never recomputes), n≥30 guard before showing aggregate CLV

**Props pipeline:**
- `api/save-prop-picks.js`: EV cap 10% (`ev > 10.0` hard reject), vig sanity 0.98–1.06 (tight). `clv_at_save` uses **decimal ratio formula** (not canonical implied prob) — confirmed cosmetic only (not displayed publicly).
- `api/capture-prop-closing-lines.js` (pre-fix): CLV formula correct. **CRITICAL BUG**: playerMap keyed by `[player][side]` without line — when Pinnacle returns alt-lines, last one overwrites standard line. Capture compares `odds_placed` (from standard line) against `closing_odds` (from whichever alt-line was last in response) — meaningless CLV.
- `api/get-prop-picks.js` → `props-record.html`: Uses stored `prop_picks.clv` (correct). **No sample size guard** on avg CLV display (unlike ML's n≥30 guard).

---

### Phase 2 — Audit Script Created

**`scripts/audit-ml-vs-props.js`** — new file. Sections A–G:
- A: Sample counts / completeness
- B: CLV sanity (stored vs recomputed formula, distribution, outliers)
- C: Capture timing (minutes before game_time)
- D: EV vs CLV relationship
- E: Beat-closing-line rates
- F: Data quality flags (suspicious swings, extreme CLV, identical placed/close, clv_at_save divergence)
- G: Summary verdict + hard launch readiness
- Includes 6 SQL queries for manual Supabase verification

---

### Phase 3 — Audit Results (live run against production Supabase)

#### ML (bets): TRUSTWORTHY BASELINE ✓

| Metric | Value |
|--------|-------|
| Total picks | 82 |
| Settled | 73 |
| With CLV | 41 (50% — historical picks predate cron) |
| avg stored CLV | **+0.88%** |
| avg recomputed CLV | **+0.88%** (exact match — 0 math mismatches) |
| Beat closing line | **63.4%** |
| CLV > 10% | 1 pick (14.3% — single outlier, acceptable) |
| CLV < -30% | 1 pick (-37% — probable injury event, not a formula error) |
| avg EV | +2.76% |

Distribution is bell-shaped with slight positive skew — healthy. Timing: `closing_odds_captured_at` is null for all historical ML bets (expected — written going forward from session 15).

#### Props (prop_picks): INFLATED — ROOT CAUSE CONFIRMED ⚠

| Metric | Value |
|--------|-------|
| Total picks | 245 |
| Settled | 189 |
| With CLV | 195 (79.6%) |
| avg stored CLV | **+7.41%** |
| avg recomputed CLV | **+7.41%** (stored = recomputed → formula is correct, INPUTS are wrong) |
| Beat closing line | **85.6%** |
| CLV > 10% | **52 picks (27%)** |
| CLV > 30% | 2 picks (Shea Langeliers +31.6%, VJ Edgecombe +30.9%) |
| avg EV | +5.21% |
| EV > 10% in DB | **22 picks** (pre-fix batter_home_runs rows) |
| Suspicious odds swing (>20pp implied) | 2 picks |
| Closing == Pinnacle at pick time | 20 picks (10%) |

Gap: Props avg CLV is **+6.54% higher than ML** — suspicious.

Capture timing: 100% of props captured 15–60 min before game (avg 24.9 min) — timing is GOOD. The problem is not timing but cross-line contamination.

---

### Phase 4 — Root Cause Analysis

**Bug 1 (CONFIRMED — now fixed): `capture-prop-closing-lines.js` playerMap overwrite**

Old structure: `playerMap[player][side] = price` — no line key. When Pinnacle returns multiple lines (e.g. Points O/U 24.5 AND O/U 25.5), the last one's odds overwrite the standard line's odds. Result: `closing_odds` field contains price for alt-line Y, but `odds_placed` is from standard line X. CLV = (implied(Y) / implied(X)) - 1 = meaningless.

Evidence: `clv=+30.9% placed=+125 closing=-139` (VJ Edgecombe player_assists over 3.5) — a 14pp implied prob swing is highly implausible for a simple line-movement on a standard NBA assists prop.

Fix applied: playerMap restructured to `[player][lineKey][side]`. Exact line match now required. If Pinnacle closing response does not contain the exact stored line, pick is skipped with reason `exact_line_not_found_at_close` (no CLV captured — cleaner than wrong CLV).

**Bug 2 (EXISTING DATA — not auto-remediated): pre-fix high-EV rows**

22 props with EV > 10% still in DB (all batter_home_runs at line 0.5, saved before session-35 vig-cap fix). These have captured CLV that was computed from genuinely extreme odds. props-record.html suppresses EV > 10% display. CLV for these rows is stored and inflates the aggregate. Manual remediation recommended (see SQL below).

**Bug 3 (NOW FIXED): No sample size guard on props CLV aggregate**

`props-record.html` was showing avg CLV whenever `avgClv != null`. With contaminated data, a small sample of high-CLV outliers can dominate the displayed average. Added `MIN_CLV_DISPLAY_N = 10` constant; avg CLV now hidden until ≥10 picks captured.

**Structural difference (not a bug): asymmetric EV caps**

ML max EV: 5%. Props max EV: 10%. Props can accumulate picks with 5–10% EV that ML would reject. This is an intentional design choice (props markets are thinner) but inflates the props EV average relative to ML.

---

### Phase 5 — Files Changed

| File | Change |
|------|--------|
| `scripts/audit-ml-vs-props.js` | NEW — comprehensive ML vs Props integrity audit |
| `api/capture-prop-closing-lines.js` | FIXED — playerMap restructured to `[player][lineKey][side]`; exact line match required; new skip reason `exact_line_not_found_at_close` added |
| `props-record.html` | Added `MIN_CLV_DISPLAY_N = 10` guard — avg CLV hidden until ≥10 picks captured |
| `backup-v44/capture-prop-closing-lines-pre-audit.js` | Backup before capture fix |
| `backup-v44/props-record-pre-clv-guard.html` | Backup before CLV guard |

**NOT changed:** CLV formula (identical in both pipelines, correct). EV formula. Any business logic. Any public page layout. ML pipeline (untouched).

**NOT deployed:** All changes staged. Session 38–39 changes also still undeployed.

---

### What Was VERIFIED

- Audit script syntax: `node --check` → clean ✓
- Audit script ran successfully against live Supabase ✓
- capture-prop-closing-lines.js syntax: `node --check` → clean ✓
- ML CLV math mismatches: **0** ✓ (stored values = recomputed)
- Props CLV math mismatches: **0** ✓ (stored values = recomputed — formula correct, inputs wrong)
- Root cause of inflated props CLV: confirmed as playerMap overwrite (alt-line contamination)
- Props capture timing: 100% within 15–60 min of game — timing not the issue

---

### What is BROKEN / UNVERIFIED

1. **Existing contaminated prop CLV rows not remediated** — 195 props with captured CLV, many with contaminated inputs. After fix is deployed, re-capture will attempt but only at exact line match. Recommend nulling out CLV for rows with suspicious odds swings (see SQL below).

2. **Fix not deployed** — capture-prop-closing-lines.js fix and props-record.html guard are staged but not pushed.

3. **Sessions 34–39 also not deployed** — props-record.html upgrades from those sessions also staged but not live.

4. **ML capture timing** — `closing_odds_captured_at` column exists on bets table but is null for 35 of 41 captured bets (written starting session 15 but not backfilled). Timing audit shows 6 with timestamp. All 6 are recent and within the correct window.

5. **ML extreme CLV outlier** — bets row `b6deb179` at -37% CLV (placed=+155, close=+305). Mathematically correct. Likely an injury/DNP event. No formula error.

6. **Props closing_odds == pinnacle_odds at pick time** — 20 props (10%) where the Pinnacle odds at pick time equals the captured closing odds. Could be: line didn't move (normal), or cap was capturing before market moved. Not blocking but should be monitored post-fix.

---

### SQL for Manual Remediation (run in Supabase SQL Editor)

```sql
-- Preview: which props have suspicious cross-line CLV contamination
-- (implied prob swing > 15pp = highly likely wrong-line capture)
SELECT id, player_name, market_type, over_under, line,
       odds_placed, closing_odds, clv,
       ROUND(
         ABS(
           CASE WHEN closing_odds > 0 THEN 100.0/(closing_odds+100)
                ELSE ABS(closing_odds)::numeric/(ABS(closing_odds)+100) END
           -
           CASE WHEN odds_placed > 0 THEN 100.0/(odds_placed+100)
                ELSE ABS(odds_placed)::numeric/(ABS(odds_placed)+100) END
         )::numeric, 4
       ) AS implied_prob_swing
FROM prop_picks
WHERE closing_odds IS NOT NULL AND odds_placed IS NOT NULL
ORDER BY implied_prob_swing DESC
LIMIT 30;

-- Remediate: NULL out CLV (and reset capture flag) for contaminated rows
-- Review the preview above first before running this
UPDATE prop_picks
SET clv = NULL,
    closing_odds = NULL,
    closing_odds_opposing = NULL,
    closing_odds_captured = false,
    closing_odds_captured_at = NULL
WHERE closing_odds IS NOT NULL
  AND odds_placed IS NOT NULL
  AND ABS(
    CASE WHEN closing_odds > 0 THEN 100.0/(closing_odds+100)
         ELSE ABS(closing_odds)::numeric/(ABS(closing_odds)+100) END
    -
    CASE WHEN odds_placed > 0 THEN 100.0/(odds_placed+100)
         ELSE ABS(odds_placed)::numeric/(ABS(odds_placed)+100) END
  ) > 0.15;

-- Archive/flag high-EV pre-fix rows (batter_home_runs > 10% EV)
-- Option A: set ev_percent = NULL so they don't inflate the average
UPDATE prop_picks
SET ev_percent = NULL
WHERE ev_percent > 0.10 AND archived = false;

-- Option B (stronger): archive those rows so they don't appear in records
-- UPDATE prop_picks SET archived = true WHERE ev_percent > 0.10 AND archived = false;
```

---

### Exact Next Action for Next Session

1. **Review contaminated rows**: Run preview SQL above in Supabase — understand which props are affected and decide whether to run the remediation UPDATE.
2. **Deploy all staged changes** (sessions 34–40): `git add -A && git commit -m "..."`, then `vercel --prod`
3. **Trigger `capture-prop-closing-lines` manually** during next NBA window — check Vercel logs for `exact_line_not_found_at_close` skip reason appearing, confirm `line_matched` counter in Done log
4. **Re-run `node scripts/audit-ml-vs-props.js`** after one week under fixed capture — expect: props avg CLV drops toward ML range, suspicious CLV > 10% count drops significantly
5. **Decide**: once contaminated rows are remediated and 10+ clean captures exist, re-enable props avg CLV display by confirming MIN_CLV_DISPLAY_N = 10 threshold is met

---

## 2026-04-21 (session 38–39) — props-record.html upgrades + prop EV audit mode

**Goal:** Three UI upgrades to `props-record.html` (ROI card, pagination, payout calculator / yesterday's results), and add temporary audit mode to `save-prop-picks.js` to diagnose suspicious high-EV picks.

**Files changed:**
- `props-record.html`:
  1. **ROI summary card** — 8th `hstat` card after Closing Captured. Populated in `loadProps()`: `ROI = profitUnits / (wins + losses) × 100` (pushes excluded from denominator). Shown green/red, `—` when no settled picks.
  2. **Pagination** — 15 rows per page (`ROWS_PER_PAGE = 15`). `render()` function slices `_allPicks` after `applyFilter()`. Pagination bar renders Prev/Next buttons + "Page X of Y". Filter tab changes reset `_currentPage = 1`. `goPage()` scrolls `#table-card` into view.
  3. **Payout calculator** — Stake slider ($1–$1000) drives wagered/return/net P/L/ROI display. `wagered = (wins + losses) × stake` (pushes excluded). Updated via `updateCalculator()`.
  4. **Yesterday's results card** — Side-by-side with calculator in `insight-row` CSS grid. Shows W–L–P record, win rate progress bar, units P/L, avg CLV, avg EV for previous calendar day (PT timezone). Populated by `renderYesterday()` using `_allPicks`.
  5. **Two-column layout** — `insight-row` CSS class: `grid-template-columns: 1fr 1fr`, collapses to single column at ≤700px.
  6. **ROI correction** — Fixed both summary card and calculator to exclude pushes from denominator (was incorrectly using `s.settled`).
- `api/save-prop-picks.js`:
  1. **`AUDIT_MODE = true`** and **`AUDIT_EV_THRESHOLD = 8.0`** constants added after `PROP_STAKE`.
  2. **`auditLog` array** added to `scanPropsForEV` output (returned alongside existing fields).
  3. **Audit block** — for every accepted candidate with `ev >= AUDIT_EV_THRESHOLD`, pushes a structured entry to `auditLog` containing: player, market, side, line, book, book_odds, pin_over, pin_under, chosen_pair, vig_pct, fair_prob, ev_pct, `pinnacle_all_lines_this_market` (all Pinnacle lines for that player/market), `best_us_sides_at_this_line`, accept_reason. Emits two `console.warn` lines prefixed `[PropPicks/AUDIT]`.
  4. **`invalid_pinnacle_vig` skip** — now includes `vig_pct` (computed actual vig %) in `skipDetail` entry.
  5. **Handler** — collects `allAuditLog` across events, includes `auditLog` in response JSON when `AUDIT_MODE && allAuditLog.length > 0`.
- `backup-v43/props-record-pre-session38.html` — snapshot taken before upgrades.

**Behavior unchanged:** Pick insertion/update/skip rules are identical. `AUDIT_MODE` only adds logging and response data. No formula changes, no new filters, no DB schema changes.

**What is NOT changed:** CLV formula, `PROP_EV_MIN`, vig thresholds (still 0.98–1.15), grading cron, `record.html`.

**Verified:** Code review only. Not deployed. To get real audit output: deploy `save-prop-picks.js`, trigger the cron (or call via admin), check Vercel function logs for `[PropPicks/AUDIT]` entries and response `auditLog` array.

**Known diagnosis from code inspection (pre-audit):**
- No maximum EV cap — any pick ≥ 2% EV passes
- Vig upper bound 1.15 (15%) is too permissive for thin markets like `batter_home_runs`
- `batter_home_runs` at line 0.5 (extreme odds Over+400/Under-650) likely source of 20–30% EV picks
- `suspiciousEvs` (>10%) flagged in console but not rejected

**Deployments:** Not deployed.

**Next session starts with:**
1. Deploy all staged changes from sessions 34–39
2. Trigger `save-prop-picks` cron and inspect Vercel logs for `[PropPicks/AUDIT]` output
3. Based on audit data, decide on fixes: EV cap (e.g. 9.9%), tighter vig ceiling for low-volume markets, or market-specific exclusions

---

## 2026-04-21 (session 37) — Add Completed filter tab to both public record pages

**Goal:** Add Completed | All | Pending | Win | Loss | Push filter tabs to `record.html` and `props-record.html`. Make Completed the default active tab on page load so users see only settled picks by default.

**Files changed:**
- `record.html` — Three changes:
  1. **Filter bar HTML**: Added `<div class="filter-bar">` with 6 buttons (Completed active by default) just above `.picks-history-card`, inside `#picks-history-section`.
  2. **Module state + filtered render**: Added `_allPickRows = []` and `_pickFilter = 'completed'` module-level vars. Added `renderPicksHistoryFiltered()` which reads `_allPickRows`, applies `_pickFilter`, updates tbody and count span. Filter logic: `completed` → `['win','loss','push'].includes(row.resultType)`; `pending` → `'pending'`; exact match for `win/loss/push`; `all` → pass-through.
  3. **`renderPicksHistory()` refactor**: Now populates `_allPickRows` with `{ sortTs, resultType, html }` objects (resolved rows use `r.outcome.toLowerCase()` as `resultType`; pending rows hardcode `'pending'`). Calls `renderPicksHistoryFiltered()` at the end instead of directly writing to tbody. Added click handler for `.filter-btn` buttons that updates `_pickFilter` and re-renders.
- `props-record.html` — Three changes (completed in prior context):
  1. Filter bar HTML: Completed added as first/active button, All lost its `active` class.
  2. `_activeFilter` default changed from `'all'` to `'completed'`.
  3. `applyFilter()` updated with `'completed'` case: `['win','loss','push'].includes(p.result)`.
- `backup-v43/props-record-pre-filters.html`, `backup-v43/record-pre-filters.html` — Snapshots taken before Session 37 changes.

**What is NOT changed:** CLV formula, grading logic, cron frequencies, API files, Supabase schema, ML pipeline.

**Verified:** Code review — filter state, click handler, resultType tagging, and deferred render all correct. No runtime test (not deployed).

**Deployments:** Not deployed.

**Next session starts with:**
1. Deploy all staged changes from sessions 34–37
2. Verify props-record.html shows Completed tab by default with correct row counts
3. Verify record.html shows Completed tab by default with correct row counts
4. After next NBA game window: trigger `GET /api/save-prop-picks`, verify `saved` + `updated` counts in response, confirm no duplicate prop rows in Supabase

---

## 2026-04-21 (session 36) — Prop picks: enforce best-line-only rule (one row per unique prop)

**Goal:** Stop saving duplicate rows for the same prop at different books. Only store one row per (event_id, player, market, line, side) — always the best available odds.

**Root cause:** `existingKeys` in Step 1 was keyed by `player|market|line|side|game_time|book` — book was part of the key, so the same prop at FanDuel and BetOnline produced two distinct keys and both were inserted.

**Files changed:**
- `api/save-prop-picks.js` — Four targeted changes:
  1. **Step 1 SELECT**: Added `id`, `event_id`, `odds_placed`, `result` to the query; removed `book` from being part of the identity key.
  2. **Step 1 data structure**: Replaced `existingKeys` (Set keyed with book) with `existingByProp` (Map keyed by `propKey = event_id|player|market|line|side`). If duplicate DB rows exist for the same prop (pre-fix data), the map keeps the one with best odds.
  3. **Step 4 replacement** (`Best-line dedup`): Two sub-steps. (4a) Collapse `allCandidates` into `bestInRun` Map by propKey, keeping best decimal odds per prop across the run. (4b) For each winner in `bestInRun`, check `existingByProp`: no DB row → `toInsert`; DB row settled/graded → skip (do not touch); DB row pending with worse odds → `toUpdate`; DB row pending with same/better odds → skip. Logs every update decision with old and new odds.
  4. **Step 5 split** (`5a insert` + `5b update`): Inserts use the existing bulk `supabase.insert()`. Updates loop individually via `supabase.update().eq('id', existingId)`, rewriting: `book`, `odds_placed`, `decimal_odds`, `ev_percent`, `pinnacle_odds`, `pinnacle_odds_opposing`, `fair_probability`, `clv_at_save`, `observed_at`. Fields NOT touched: `id`, `picked_at`, `result`, `closing_odds`, `clv`, `closing_odds_captured*`, `stake_units`, `archived`, prop identity fields.
  - API response now includes `updated` count and `updatedPicks` list alongside `saved` and `skippedByReason`.
- `backup-v43/save-prop-picks-pre-bestline.js` — Snapshot of save-prop-picks.js before this change.

**Deployments:** Not deployed.

**Odds comparison method:** `amToDecimal(odds)` is used for all comparisons — higher decimal = better odds regardless of sign. Correct for all cases: +110 (2.10) > +101 (2.01), -105 (1.952) > -120 (1.833).

**What is NOT changed:** CLV formula, closing odds capture, grading logic, cron frequencies, ML pipeline.

**Next session starts with:**
1. Deploy and trigger `GET /api/save-prop-picks` manually during next NBA window
2. Verify `saved` + `updated` in response; confirm no duplicate rows in `prop_picks` for same (event_id, player, market, line, side)
3. Run audit SQL: `SELECT player_name, market_type, line, over_under, event_id, COUNT(*) FROM prop_picks WHERE archived=false GROUP BY 1,2,3,4,5 HAVING COUNT(*) > 1;` — should return 0 rows going forward

---

## 2026-04-21 (session 35) — Prop EV integrity fix: strict Pinnacle line matching + public suppression

**Goal:** Fix unrealistically high prop EV values (10%–30%+) caused by Pinnacle alt-line mixing. Add public EV suppression as immediate containment while the matching fix rolls out.

**Root cause:** The old `pinMap` keyed Pinnacle outcomes as `[market][player][side]` — meaning for a player with multiple alt lines, only the LAST entry per side survived (overwrite). This resulted in `pinPlayer.Over` and `pinPlayer.Under` potentially coming from different alt lines (e.g., Over 24.5 vs Under 28.5), producing impossibly large no-vig edges.

**Files changed:**
- `api/save-prop-picks.js` — Complete rewrite of `scanPropsForEV` with strict matching. (1) `pinMap` restructured to `[market][player][lineKey][side]` — all alt lines stored, each line grouped by exact `String(o.point)` key. (2) `bestMap` restructured to `[market][player][lineKey][side]` — best price per (player, exact line, side). (3) Matching loop now iterates `(player, lineKey, side)` tuples; looks up exact same lineKey in Pinnacle; requires BOTH Over AND Under at that exact line before computing no-vig EV — if either is missing, skips with labelled reason. (4) Skip reasons: `market_not_found`, `player_not_found`, `exact_line_not_found`, `opposing_side_same_line_not_found`, `invalid_pinnacle_vig`, `ev_below_threshold`. (5) Suspicious EV (>10% that survived strict matching) logged as `console.warn` with full odds details. (6) API response now includes `skippedByReason` counts, `suspiciousEvs` array, and `skipDetail` array (when suspicious EVs present). Handler merges skip counts across all events and logs skip summary.
- `props-record.html` — Added `MAX_PUBLIC_PROP_EV = 0.10` and `PROP_EV_WARN = 0.07` constants. Updated `fmtEv()`: values above 10% are suppressed (show `—` with "EV under review" tooltip); values 7–10% show an amber ⚠ warning indicator. Row remains visible so record accuracy is preserved.
- `prop-admin.html` — Added `ev-suspicious` CSS class (red). EV cell now shows `⚠ SUSP` badge for rows >10% and amber `⚠` for rows >7%. Admins see the actual EV value plus the flag; public pages do not.
- `backup-v43/` — `save-prop-picks.js` and `prop-admin.html` added to existing backup.

**Deployments:** Not deployed — staged for review.

**What was VERIFIED (static):**
- `pinMap` now keyed by `lineKey = String(o.point)` — no overwriting between alt lines
- `bestMap` keyed by same `lineKey` — Over and Under for same player/line always from the same ladder
- Matching loop: `pinLine = pinPlayer[lineKey]` — exact string key match, no fuzzy fallback
- Both `pinLine.Over` and `pinLine.Under` checked before using either in `calcPropEV`
- All 6 skip reasons tracked in `skippedByReason` counters
- Suspicious EV logged before saving, returned in response
- Props-record public suppression: threshold is a single constant, easy to adjust
- Admin sees real values + suspicious badges

**What needs to happen after deploy:**
1. Trigger `GET /api/save-prop-picks` manually against a live game window and inspect `skippedByReason` in the response — expect `exact_line_not_found` count to drop (alt-line mixing was the main source of false positives)
2. If `suspiciousEvs` array is non-empty after strict matching, those specific picks require manual odds verification before trusting
3. Existing `prop_picks` rows with high EV cannot be retroactively corrected (live odds are gone). Run this audit SQL to identify affected rows:
   ```sql
   SELECT id, player_name, market_type, over_under, line, odds_placed, ev_percent, picked_at
   FROM prop_picks
   WHERE ev_percent > 0.10 AND archived = false
   ORDER BY ev_percent DESC;
   ```
   Options: leave as-is (frontend suppresses display), or set `ev_percent = NULL` for those rows, or archive them.
4. After one full cron run post-deploy, verify new rows have realistic EVs (2–7% range expected for most qualifying props)
5. Raise or lower `MAX_PUBLIC_PROP_EV` in `props-record.html` once confident in matching quality

**What is NOT changed:**
- CLV formula (unchanged)
- Grading logic (unchanged)
- Cron frequencies (unchanged)
- ML bets pipeline (untouched)

**Next session starts with:**
1. Deploy and trigger a manual prop scan during next NBA game window
2. Inspect `skippedByReason` — confirm `exact_line_not_found` is now the dominant skip reason (not EV threshold)
3. Review any `suspiciousEvs` entries manually

---

## 2026-04-21 (session 34) — Record pages upgraded: closing odds + CLV on main rows, new summary cards

**Goal:** Upgrade both public record pages (props-record.html, record.html) to production-grade, data-first layouts with closing odds and CLV surfaced on main table rows.

**Files changed:**
- `api/get-prop-picks.js` — Added `closing_odds`, `closing_odds_opposing`, `closing_odds_captured`, `closing_odds_captured_at`, `clv`, `clv_at_save` to the SELECT. Added `avgClv` (avg over captured picks) and `closingCaptured` count to the summary response payload.
- `api/get-stats.js` — Added `book` to the betsSupp SELECT in `handleRecord`. Added `r.bets_book` supplement for resolved rows and `p.bets_book` for pending rows so book is available to the frontend.
- `props-record.html` — (1) Hero sub: Removed "grading coming soon" language. (2) Summary cards: Expanded from 5 to 7 — Total Props, Record, Win Rate, Units P/L, Avg EV, Avg CLV (closing captured only), Closing Captured count. Grid changed to `repeat(4, 1fr)`. (3) Removed `grading-notice` div entirely. (4) Summary logic: All cards always visible — no conditional hiding when nothing settled, show `—` instead. (5) Table: Added Closing, CLV, Units columns (8→11 columns). Min-width increased to 1080px. (6) Added `fmtClv()` and `fmtUnitsResult()` helper functions. (7) `render()`: Updated to emit 11 cells per row including closing odds, CLV, and units.
- `record.html` — (1) Picks history table columns restructured: Date/Time, Pick (with sport badge), Matchup, Book, Odds, EV%, Closing, CLV, Result, Units, Score. Dropped separate "Picked" and "Sport" columns. (2) Added `.matchup-text` and `.book-tag` CSS. (3) `renderPicksHistory()`: Resolved rows now use `r.bets_book`, pending rows use `p.bets_book`; matchup shown as separate column; closing odds and CLV remain on main row. Min-width increased to 1000px.
- `backup-v43/` — Backup of all 4 changed files before modifications.

**Deployments:** Not deployed — staged for review.

**What was VERIFIED:**
- All colspan values consistent at 11 across props-record.html and record.html
- `get-prop-picks.js` select confirmed to include 6 new closing/CLV fields
- `get-stats.js` betsSupp select confirmed to include `book`, with `bets_book` supplement for both resolved and pending rows
- Summary card IDs cross-checked with loadProps() populate logic
- fmtClv, fmtUnitsResult helpers present and called in render()
- No "grading coming soon" language remains in props-record.html

**What is NOT yet done:**
- Pages not deployed — no production verification
- `book` column in main record depends on the bets table having a `book` field for those pick_ids — if old bets rows pre-date the book column they'll show `—`
- CLV and closing odds columns for props-record will show `—` for picks saved before the schema migration added those columns to prop_picks

**Next session starts with:**
1. Deploy and verify both record pages render correctly with real data
2. Check that book column populates for recent bets (not pre-migration rows)
3. Check that Avg CLV and Closing Captured summary cards show real numbers on props-record
4. Consider adding a "last updated" or date-range selector to both record pages

---

## 2026-04-21 (session 33) — Props CLV verified, admin layout unified, record pages queued for upgrade

**Goal:** Finalize props lifecycle verification, fix admin UI inconsistencies, align admin layouts, and prepare record pages for production upgrade.

**Files changed:**
- `api/capture-prop-closing-lines.js` — Full overhaul: (1) Added debug query params (`prop_id`, `event_id`, `player`) to restrict processing to a subset for live verification — when any filter is active, `per_pick` trace array is included in response. (2) Extended Supabase select to include `line` and `book`. (3) Per-pick trace object with 20 fields logged per candidate: `player_raw`, `player_normalized`, `event_found`, `player_found`, `market_found`, `pinnacle_line`, `line_matched`, `side_found`, `closing_odds_found`, `closing_odds_opposing_found`, `closing_odds_captured`, `clv_calculated`, `skip_reason`. (4) Pinnacle `outcome.point` now stored in playerMap (`Over_line` / `Under_line`) — line comparison is logged as informational, non-blocking. (5) Race condition detection: update now uses `.select('id')` — if 0 rows updated, logs `already_captured_race`. (6) Structured response payload with full counts: `total_in_window`, `already_captured`, `needs_capture`, `filtered_candidates`, `event_matched`, `market_matched`, `player_matched`, `side_matched`, `line_matched`, `closing_captured`, `clv_calculated`, `skipped_by_reason`.
- `prop-admin.html` — (1) Fixed field name bugs: `r.closing_captured` → `r.closing_odds_captured` (summary card, table badge); `r.closing_captured_at` → `r.closing_odds_captured_at` (detail panel). These bugs caused CLV Captured card and CLV badge to always show 0 / "Pending". (2) Added `closing_odds_opposing` and `closing_odds_captured` (boolean) to detail panel. (3) Added lifecycle status system: `lifecycleLabel()` and `lifecycleBadge()` — four states: Saved / Closing Captured / Graded w/o Closing / Settled. Lifecycle badge replaces the old static CLV ✓ / Pending badge in the table CLV column. (4) Added AVG CLV summary card — computed from `rows.filter(r => r.clv != null)` using true closing CLV only (not `clv_at_save`); displays with color coding and pick count sub-label. (5) Added Grade Props button in nav — calls `GET /api/grade-props`, shows loading state, displays graded/skipped/errors toast, reloads table on completion. (6) Fixed cross-link: `href="/admin"` → `href="/admin.html"` (no rewrite rule existed for `/admin`).
- `admin.html` — Full layout migration to match `prop-admin.html` structure: (1) Replaced summary bar (6 old cards with `stat-*` IDs) with new 7-card set (`s-*` IDs): Total, Pending, Settled, Win Rate, Units P/L, CLV Captured, Avg CLV. (2) Replaced `renderStatsBar()` to populate new IDs. (3) Replaced flat 16-column table with 14-column expandable-row table — Score and CLV Captured timestamp moved to detail panel; Closing Odds and CLV remain on main row. (4) Replaced `renderTable()` with DOM-manipulation implementation (paired `data-row` + `detail-row hidden` elements, click-to-expand, action button clicks do not trigger expand). (5) Added `buildDetail(p)` — 18-field detail grid: lifecycle, pick, game, sport, pick_type, result, score, odds_placed, ev_percent, book, closing_odds, closing_odds_captured, closing_captured_at, clv, profit_units, picked_at, game_time, pick_id. (6) Added `lifecycleLabel()`, `fmtOdds()`, `esc()` helper functions. (7) Added CSS: `.detail-grid`, `.detail-item`, `.detail-label`, `.detail-val`, `.detail-val.missing`, `.data-row:hover td`, `.detail-row.hidden`, `.badge-clv-ok`, `.badge-clv-no`, `stat-muted`, dark mode detail row. (8) Added `Props →` nav link to `prop-admin.html`. (9) All `Inter` font references replaced with `Outfit` (font load + 10 CSS declarations).

**Deployments:** Three deploys in this session — `dpl_GDHvRakasNwELLRxc52BZnHKUZPW`, `dpl_6ey8bFzhZngyZ8oZdQ41WAUw2Adq`, `dpl_8A6PsvJYVqzoroFiGMDNios2N23g` (final, live).

**Verified:**
- `capture-prop-closing-lines` confirmed capturing real closing odds in production — `closing_odds`, `closing_odds_opposing`, `closing_odds_captured`, `closing_odds_captured_at` all populating correctly
- CLV calculation verified correct using implied probability formula; positive CLV examples match expected math
- Props lifecycle end-to-end confirmed: save → capture closing → CLV write → grade → result + profit_units
- AVG CLV summary card displaying correctly in prop-admin (using true closing CLV, not clv_at_save)
- Grade Props button functional — correct loading state, toast response, table reload
- Admin page cross-links working: `admin.html ↔ prop-admin.html`
- `admin.html` expandable rows working — click expands detail panel, action button clicks do not trigger expand

**What is NOT yet done:**
- Record pages (`record.html`, props record equivalent) still use older layouts — no closing odds or CLV on main rows
- Props record page still contains "grading coming soon" messaging that is no longer accurate
- Visual hierarchy of admin tables can still be improved (CLV emphasis, odds → closing relationship)

**Next session starts with:**
1. Upgrade props record page to production standard — remove "coming soon" messaging, surface closing odds + CLV on main rows, consistent summary cards
2. Apply same layout system to main `record.html`
3. Ensure both record pages show closing odds + CLV on main row, use consistent summary cards, and match overall Capy design system
4. Improve visual hierarchy across admin and record pages (CLV prominence, odds → closing relationship)

---

## 2026-04-20 (session 32) — Props pipeline: debug, cursor pagination fix, name normalization

**Goal:** Diagnose and fix grade-props returning 0 graded / 21 skipped. Root cause: BDL v1 uses cursor-based pagination (not page-based), and player name normalization did not strip generational suffixes (Jr, Sr, II, III, IV, V).

**Files changed:**
- `api/grade-props.js` — (1) Added skip reason counters (7 categories: `game_not_final`, `player_name_no_match`, `dnp_or_zero_minutes`, `unsupported_stat_type`, `stat_field_missing`, `unknown_side`, `player_name_missing`) returned in response body. (2) Added `skip_detail` per-pick array and `date_summary` (total_rows, final_rows, pages fetched per date) for diagnostics. (3) Fixed pagination: replaced `meta.next_page` + `page` param with `meta.next_cursor` + `cursor` param — BDL v1 uses cursor-based pagination; `next_page` is always null. (4) Added `.replace(/\s+(jr|sr|ii|iii|iv|v)$/, '')` to `normalizePlayerName` — BDL uses legal names ("Donovan Clingan Jr.", "Ron Holland II"); props API uses common names without suffix.
- `api/capture-prop-closing-lines.js` — Added same `.replace(/\s+(jr|sr|ii|iii|iv|v)$/, '')` suffix-strip to `normalizePlayerName` for consistency.

**Root cause chain:**
1. First run: grade-props returned `{"graded":0,"skipped":21}` — no breakdown visible
2. Added skip reason counters → revealed all 21 skips were `player_name_no_match`
3. Switched BDL fetch from `game_ids[]` → `dates[]` (playoff game IDs fail on `/v1/stats`) → 19/21 now grading
4. Two remaining: Ron Holland, Donovan Clingan → BDL uses "Ron Holland II", "Donovan Clingan Jr." — suffix not stripped → after suffix fix, Ron Holland graded; Clingan still failing
5. `date_summary` showed `total_rows: 100, pages: 1` for April 19 (4 playoff games ≈ 104+ players) → exactly one full page, Clingan on page 2 that was never fetched
6. Fix: cursor-based pagination. `meta.next_cursor` is non-null when more pages exist; loop continues until null.

**Schema migration (must be run in Supabase SQL Editor before capture-prop-closing-lines and grade-props can write):**
```sql
ALTER TABLE prop_picks
  ADD COLUMN IF NOT EXISTS closing_odds             integer,
  ADD COLUMN IF NOT EXISTS closing_odds_opposing    integer,
  ADD COLUMN IF NOT EXISTS closing_odds_captured    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closing_odds_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS clv                      numeric,
  ADD COLUMN IF NOT EXISTS profit_units             numeric;
```

**Verified:**
- `grade-props` run on April 19 NBA playoff slate: 19/21 graded successfully after `dates[]` fix
- Skip breakdown visible in response — confirmed 2 were `player_name_no_match` (Clingan, Holland), 0 other categories
- Ron Holland graded correctly after suffix-strip fix
- Cursor pagination code confirmed in `grade-props.js` (file read post-deploy)
- Deploy (`vercel --prod`) completed successfully — deployment ID `dpl_4YdZnkGjvZfuzFt3TJY7HbwKmgvg`
- Post-deploy `GET /api/grade-props` returns `{"message":"No pending props","graded":0}` — backlog fully cleared

**What is NOT yet verified:**
- Donovan Clingan specifically graded (backlog cleared before post-deploy curl; cannot distinguish graded vs table empty without direct Supabase query)
- `capture-prop-closing-lines` has not been tested on a live game window — Pinnacle prop response shape and player name matching unverified against real data
- Schema migration status unknown — columns may not exist yet on `prop_picks`

**Next session starts with:**
1. Confirm schema migration has been run (query `prop_picks` columns in Supabase)
2. Manually trigger `GET /api/capture-prop-closing-lines` during next NBA game window — check Vercel logs for closing_odds writes
3. After next slate grades: query `prop_picks` for `result IS NOT NULL` rows — confirm profit_units, clv, closing_odds all populated
4. Audit Vercel cron usage: three new crons added (save-prop-picks 30m, capture-prop-closing-lines 15m, grade-props 2h) — check against plan limits

---

## 2026-04-20 (session 31) — Props lifecycle: save frequency, grading, closing line capture + CLV

**Goal:** Build the full props lifecycle mirroring the working ML/bets pipeline. Props were saving once daily, never grading, and had no closing line or CLV capture.

**Files changed:**
- `vercel.json` — (1) `save-prop-picks` schedule: `0 13 * * *` → `*/30 * * * *`; (2) added `capture-prop-closing-lines` cron `*/15 * * * *`; (3) added `grade-props` cron `0 */2 * * *`
- `api/grade-props.js` (new) — grades pending NBA prop_picks via BallDontLie player stats. MLB skipped cleanly (no stat source). Grading logic: over/under vs actual stat vs line → win/loss/push. DNP players (min=0) are skipped, not auto-graded as loss. Writes `result` + `profit_units` to prop_picks. Never overwrites already-settled rows.
- `api/capture-prop-closing-lines.js` (new) — captures Pinnacle closing lines for prop_picks near game start. Mirrors `capture-closing-lines.js` but matches by `(event_id, market_type, player_name, side)` instead of h2h game_id. Writes `closing_odds`, `closing_odds_opposing`, `closing_odds_captured`, `closing_odds_captured_at`, `clv` (true closing CLV). Does NOT overwrite `clv_at_save` (snapshot CLV at pick time — intentionally separate).

**Schema migration (user must run in Supabase SQL Editor before Phase 3 is live):**
```sql
ALTER TABLE prop_picks
  ADD COLUMN IF NOT EXISTS closing_odds             integer,
  ADD COLUMN IF NOT EXISTS closing_odds_opposing    integer,
  ADD COLUMN IF NOT EXISTS closing_odds_captured    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closing_odds_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS clv                      numeric,
  ADD COLUMN IF NOT EXISTS profit_units             numeric;
```

**Pipeline summary after this session:**

| Step | Endpoint | Schedule | Source of truth field |
|---|---|---|---|
| Save props | `save-prop-picks` | Every 30min | `odds_placed`, `clv_at_save` |
| Capture closing line | `capture-prop-closing-lines` | Every 15min | `closing_odds`, `clv` |
| Grade results | `grade-props` | Every 2h | `result`, `profit_units` |

**CLV design:**
- `clv_at_save` = snapshot CLV at pick time (decimal odds ratio vs Pinnacle at that moment) — unchanged
- `clv` = true closing CLV = `(impliedProb(closing_odds) / impliedProb(odds_placed)) − 1` — same formula as ML bets pipeline

**Verified:**
- `vercel.json` cron config confirmed correct (file read after all edits)
- `grade-props.js` market_type → BDL stat field mapping covers all 5 NBA prop markets
- `capture-prop-closing-lines.js` uses exact same CLV formula as `capture-closing-lines.js`
- Player name normalization strips diacritics (Jokić → jokic) and uses last-name + first-initial fallback

**What is NOT yet verified (requires deploy + live data):**
- Schema migration not yet applied — `closing_odds`, `closing_odds_captured`, `clv`, `profit_units` columns don't exist on `prop_picks` yet. `capture-prop-closing-lines` and `grade-props` will fail until this is run.
- `grade-props` has not run against real data — BDL player name matching untested on live picks
- `capture-prop-closing-lines` has not run — Pinnacle prop response shape at event endpoint untested in this context (used differently than the game-level h2h endpoint)

**What is still UNBUILT:**
- MLB prop grading (no stat source — documented as intentional gap, will revisit)
- props-record.html performance stats (win rate, ROI, CLV) — blocked until graded data accumulates
- DNP voiding (skipped picks stay pending indefinitely — may need manual void or automated void after 48h)

**Next session starts with:**
1. Run the schema migration in Supabase SQL Editor
2. Deploy (`git push`)
3. Manually trigger `GET /api/capture-prop-closing-lines` during a game window — check Vercel logs for Pinnacle response shape
4. Manually trigger `GET /api/grade-props` after an NBA game ends — check for graded rows in prop_picks
5. If BDL player name matching fails on specific players, add them to a name-alias map in grade-props.js

---

## 2026-04-19 (session 30) — UI consistency pass + odds page scan hierarchy pass

**Goal 1 — UI consistency pass:** Standardize card spacing, borders, shadows, chip/pill styling, and design token drift across odds.html, props.html, parlay.html, stats.html. No redesign.

**Goal 2 — Odds page scan hierarchy pass:** Restore intended card layout (not list-like), make edge % most prominent scan target, add missing ev-conf-pill CSS, clean dead layout CSS.

**Files changed:**
- `parlay.html` — Root token drift fixed (aligned to odds.html values). Border widths normalized 0.5px/1.5px → 1px. Box-shadows added to summary-card, hedge-section, selector-card. Sport-tab, props-search, payout-input, leg-btn borders normalized.
- `stats.html` — Root token drift fixed. Sidebar-card, section, section-header, welcome, team-hero, coming-soon-card, sport-tab, sort-btn, inner-tab all normalized to 1px borders with consistent shadows.
- `props.html` — `.sport-badge` border-radius 5px → 6px, padding aligned.
- `odds.html` — (1) Added missing `.ev-conf-pill`, `.ev-conf-strong`, `.ev-conf-playable`, `.ev-conf-small` CSS classes — these were generated by JS but had no CSS definitions, making edge badges invisible. (2) Restructured `.gc-header` from single flex row to column layout: sport-tag + time on top row (`.gc-header-top`), matchup on second row, edge pill on third row (`.gc-header-meta`). (3) Added `.gc-col-center .gc-col-odds { font-size: 26px; }` to make EV % larger than side odds. (4) Removed dead CSS: `.game-header`, `.game-teams`, `.game-tags`, `.game-edge-row`, `.game-edge-big`, `.game-edge-text`. (5) Removed dead mobile-collapse `@media (max-width: 700px)` expand/collapse block. (6) `.filter-btn` padding 4px → 5px.

**Verified:** CSS classes now present (`ev-conf-strong`, `ev-conf-playable`, `ev-conf-small`). JS `headerHtml` updated to match new DOM structure. Dead CSS confirmed absent (grep). `.game-time` preserved — still used in `renderTopEdgeHero`.

**What is NOT changed:** EV logic, filtering, pick sorting, sharp picks section, all odds data, parlay builder plumbing.

**What is still UNVERIFIED:** Visual render in browser (no live server). ev-conf-pill badges should now be visible on game cards — requires deployment to verify at full fidelity.

**Next action:** Deploy (`vercel --prod`). Check odds page at mobile (390px) and desktop: edge pills should appear below matchup name, EV % in center column should be 26px and clearly the dominant number.

---

## 2026-04-19 (session 29) — Remove "High Upside Parlays" section from odds.html

**Goal:** Remove the parlay suggestion section from the odds page to tighten the layout. Preserve the three functions for future use in parlay.html.

**Files changed:**
- `odds.html` — (1) Removed HTML: entire `<!-- HIGH UPSIDE PARLAYS -->` block (section-divider + `#parlay-suggestions-section` div). (2) Removed JS: `renderParlaysuggestions()` call from `renderPicks()`. (3) Commented out three functions (`renderParlaysuggestions`, `buildValueParlayCard`, `buildUpsideParlayCard`) with preservation header noting dependencies and how to reactivate.
- `parlay.html` — Added same three functions as a `/* ... */` comment block at end of `<script>`, with activation instructions and dependency list.

**Verified:** grep confirmed zero active (outside-comment) references to `renderParlaysuggestions`, `parlay-suggestions-section`, `value-parlay-container`, `upside-parlay-container` in odds.html. All parlay builder plumbing kept active: `+ Parlay` buttons, `addToParlayFromGame`, `addParlayToBuilder`, toast, localStorage sync, all parlay CSS.

**What is NOT changed:** EV logic, game filtering, pick sorting, sharp picks section, longshot section, all odds card rendering, per-card parlay buttons.

**Next action:** Deploy (`vercel --prod`). Visually verify odds page tighter below EV section. Verify parlay builder still works from odds page.

---

## 2026-04-19 (session 28) — Live example card rebuild + full lowercase pass

**Goal:** (1) Rebuild live example card to match current odds page ev-card design. (2) Apply lowercase copy style consistently across the entire landing page.

**Files changed:**
- `index.html` — CSS: replaced entire `/* HERO EDGE CARD */` block with new `.hero-edge-card` (1px border + 3px green left border, no green bar, no glow) + new subclasses mirroring ev-card structure (`.hero-card-header`, `.hero-card-meta`, `.hero-card-ev-row`, `.hero-card-compare`, `.hero-card-book-col`, `.hero-card-sharp-col`, `.hero-card-odds`, `.hero-card-bet-btn`). HTML: rebuilt live example card (ev-number headline → 2-col compare → bet button; removed green bar, 3-col layout, pill actions). Lowercase pass: h1, eyebrow, CTAs, stats strip, how-steps, tagline, promo banner, cost section, features section (titles + descs), books section, compare section, pricing section, partners section, signup section, nav links, mobile menu links.

**Verified:** All CSS classes accounted for — no stale class references. Dark mode guards added for all new hero-card classes. Proper nouns preserved (Pinnacle, DraftKings, GetCapy, Capy, OddsJam). Data values, odds, timestamps not lowercased. Plan tier names (Casual, Sharp, Annual) kept capitalized.

**Judgment calls:**
- Plan tier names (Casual, Sharp, Annual) kept title case — they're product tier names, not marketing copy
- "CLV tracking" kept as-is — CLV is an acronym
- "EV" kept capitalized in all feature descriptions — acronym
- Nav links lowercased — fits the editorial theme without hurting navigation clarity
- "illustrative" badge on live example card uses muted styling (not green) — it's a disclaimer, not a feature

**Next action:** Deploy and visually verify in production (light + dark mode, mobile 390px).

---

## 2026-04-19 (session 27) — Hero section copy + Live Example reorder

**Goal:** Tighten hero copy for clarity, move Live Example up the page for earlier proof, trim feature card copy.

**Files changed:**
- `index.html` — hero-sub: new two-line copy ("most bets are priced wrong..."); removed +EV sentence; added supporting line "compare every line to pinnacle and spot real edges in seconds."; secondary CTA: "See today's best lines" → "See today's edges"; Live Example moved from after how-steps to immediately after hero-stats (before how-steps), with "Live example" label above and "Illustrative" badge removed; feature card copy: 5 targeted trims (Player Props who, Best bet radar desc+who, Live odds who, CLV who).

**Verified:** All 9 edits confirmed in file. No structural HTML changes — only content reordering within the hero div.

**Next action:** Deploy and visually verify hero section on mobile (390px) and desktop.

---

## 2026-04-19 (session 26) — Landing page comparison section refresh

**Goal:** Update the "before/after" comparison section on index.html so the right-side Capy card matches the current live odds card design.

**Files changed:**
- `index.html` — CSS: replaced 3-column `.demo-summary` grid styles with new `.demo-ev-row`, `.demo-compare`, `.demo-book-col`, `.demo-sharp-col`, `.demo-col-*` classes matching live card structure; removed `.demo-ev-pill`; added dark mode guards for `.demo-compare`/`.demo-sharp-col`. HTML: rebuilt right-side card (EV headline row + 2-col compare grid replacing center green EV block); added `border-left: 3px solid var(--green-dark)` to match `ev-positive` card. Copy: right headline → "getcapy shows you the edge instantly."; bottom line → "find the edge. skip the spreadsheet."

**Verified:** CSS and HTML changes inspected — no stale class references remain; dark mode border-color guards added.

**Still unverified:** Visual check in browser at getcapy.co — deploy needed.

**Next action:** Deploy and visually verify at getcapy.co on mobile (390px) and desktop.

---

## 2026-04-19 (session 25) — Props Record page, Closing column fix, Odds page hierarchy cleanup

**Goal:** (1) Build props-record.html. (2) Fix blank Closing column on record.html. (3) Clean up odds.html to remove duplicate edge sections.

**Files changed:**
- `api/get-prop-picks.js` — new endpoint; queries prop_picks, returns picks + summary stats
- `props-record.html` — new page; auth gate, summary stats row, filter bar, prop pick table
- `api/get-stats.js` — added `closing_odds` to bets supplement select; mapped as `bets_closing_odds`
- `record.html` — closing column now prefers `bets_closing_odds` over `closing_line`; tooltip updated
- `odds.html` — removed intro blurb, top-edge-hero-section div, sharp-picks-section div; buildEvCard: "EV vs Pinnacle" → "edge", removed per-card context repetition, added isTopEdge badge; renderEvSection: first card gets Top Edge badge; renderPicks: null-guards for sharpSection/sharpContainer; parlay cards: "Sharp Parlay" and "Entertainment Only" titles; "Avg edge: +X.X%"

**Verified:**
- Props-record.html: auth gate tested (sessionStorage pattern), schema confirmed by querying 3 live rows before writing, ev_percent decimal handling confirmed (0.038 → 3.8%), empty-settled state hides record/winrate/units cards
- Closing column: 9 of 33 previously-blank rows now show closing odds via bets_closing_odds; 24 rows have genuinely missing data (no capture ran) — cannot recover retroactively
- odds.html: all null-guards confirmed, parlay titles confirmed, no remaining references to removed divs

**Still broken / unverified:**
- odds.html deploy not yet confirmed live — should be pushed and visually verified at getcapy.co/odds.html
- props-record.html not yet deployed — needs push to Vercel

**Next action:** Deploy to Vercel (git push), then visually verify odds.html and props-record.html in production.

---

## 2026-04-19 (session 24) — Odds card redesign, record page cleanup, prop cap removed

**Summary:** Three parallel tracks — (1) iterative redesign of the EV edge cards on odds.html, (2) removed props from record.html, (3) removed the hard cap on saved prop picks and corrected a wrong risk note about dedup behavior.

---

### 1. Odds page UI refactor (odds.html)

**Why:** EV was visually subordinate to the odds numbers it's explaining. Labels were redundant. Green was overused. The card read as a bet slip rather than a market signal.

**Changes:**
- Replaced 3-column layout (Best Book | EV center | Pinnacle) with EV headline row + 2-column odds comparison
- EV is now 30px and the first element read — odds columns are 24px below it
- Removed labels: "Best Book", "vs Pinnacle", "Sharp line", "Fair price"
- Removed confidence pills ("Strong Edge", "Good Edge", "Edge") — EV number is self-explanatory
- Book name moved inline next to odds (2 rows instead of 3)
- Green now used only on: EV number + Bet CTA button
- Share and Parlay demoted to text-only links (no border, smaller)
- Breakdown toggle moved to end of actions row
- Added microcopy for positive-EV cards: "Books are offering better odds than the sharp market"
- Sharp column label: "no-vig" → "fair price"
- Compare section border softened: `1px solid rgba(0,0,0,0.07)` instead of `var(--border)`

**Files changed:** `odds.html` (CSS + `buildEvCard()` HTML template)

---

### 2. EV breakdown panel refactor (odds.html)

**Why:** Flat list of 6 rows with no grouping made it hard to follow the logic chain. Formula note at bottom was noise.

**Changes:**
- Restructured into 3 labeled groups separated by subtle dividers:
  1. **Sharp reference** — Pinnacle line · Vig
  2. **Fair market** — Fair probability · Fair odds
  3. **Your edge** — Book odds · Expected value (green)
- Labels use `.ev-bd-label` (hint color, Outfit 11px); values use `.ev-bd-value` (DM Mono 12px, strong)
- EV result row: label stays muted, value bumped to 13px green
- Group spacing: 12px gap + border-top between groups
- Padding increased to `14px 16px` (matches card rhythm)
- Border matches compare section: `rgba(0,0,0,0.07)`
- Formula text removed
- Dark mode rules consolidated (removed duplicate rule)

**Files changed:** `odds.html` (CSS + `buildEvCard()` breakdown HTML)

---

### 3. Record page — props removed (record.html)

**Why:** `prop_picks` rows have no graded results yet. Mixing them with fully-tracked bets (`picks` + `results` join) produced an incomplete record.

**Changes:**
- `loadPicksHistory()` — simplified from `Promise.allSettled([record fetch, props fetch])` to a single `fetch('/api/get-stats?type=record')`
- `renderPicksHistory()` — removed `propBets` parameter, removed `propBets.length` from `totalCount`, removed prop rendering loop
- Removed prop-only helper functions: `STAT_ABBREV`, `fmtPropLabel`, `fmtStatTag`
- Updated comment to explain props are excluded, not forgotten

**Current behavior:** Record page shows only bets from the `picks + results` join. Props will be shown on a dedicated page once grading is in place.

**Files changed:** `record.html`

---

### 4. Prop cap removed (api/save-prop-picks.js)

**Why:** `PROP_MAX_DAILY = 5` was blocking all props from saving once the daily limit was hit, even on high-opportunity slates.

**Changes:**
- Deleted `const PROP_MAX_DAILY = 5`
- Deleted `todayCount` / `slotsLeft` calculation
- Deleted `if (slotsLeft <= 0)` early-exit block
- Removed `.slice(0, slotsLeft)` — `selected` is now the full deduped array
- Updated file header comment and Step 4 comment

**Current behavior:** All props meeting `PROP_EV_MIN = 2.0%` and passing dedup are saved. No daily ceiling.

**Dedup key (unchanged):**
```
player_name | market_type | line | over_under | game_time | book
```

**Dedup rules (verified from code):**
- Same line + odds move → **NOT saved again** (odds_placed is not in the key)
- Line changes (e.g. o28.5 → o29.5) → saved as new row (structurally different bet)

**Known risks:**
- High-volume slates may produce many saves — expected and acceptable
- No prop grading yet; props accumulate with `result = 'pending'` indefinitely
- No CLV capture for props yet

**Files changed:** `api/save-prop-picks.js`

---

**Next steps:**
- Build dedicated props record page (or integrate props fully into bets + grading system)
- Add prop grading (win/loss/push via `check-results.js` or a dedicated job)
- Optional: prop CLV / closing line tracking
- Continue odds page polish (filter UX, mobile consistency)

---

## 2026-04-19 (session 23) — Three bug fixes: Last 7 Days / save-prop-picks / CLV formula

**Goal:** Fix three reported bugs in order: (1) Last 7 Days chart including future/pending games, (2) save-prop-picks saving 0 picks despite props page showing +EV, (3) CLV inconsistency across rows.

---

### Bug 1 — Last 7 Days chart including future games

**Diagnosis:** Already fixed in session 20. The `last7Days` loop in `api/get-stats.js` `handleStats` already uses `resolved` (win/loss/push only) as its source. Pending and future-dated bets cannot appear.

**Code location confirmed:** `api/get-stats.js` line 446 — `for (const b of resolved)`.

**Action:** No code change needed. Verified the fix from session 20 is in place.

---

### Bug 2 — save-prop-picks saves 0 picks despite page showing +EV

**Root cause:** In `scanPropsForEV` (api/save-prop-picks.js), the `pinMap` and `bestMap` were built with key order **`[market][side][player]`** (inverted), but accessed as **`[market][player]`** and **`[market][player][side]`** respectively.

Concretely:
- `pinMap['player_points']['Over']['Nikola Vucevic']` was built (side is outer key)
- Access: `pinMkt[playerName]` = `pinMap['player_points']['Nikola Vucevic']` = **undefined** (player key doesn't exist at that level)
- `!pinPlayer?.Over?.price` was always true → every prop was filtered out → 0 saves

The `bestMap` had the same inversion: iteration over `Object.entries(players)` yielded `'Over'` and `'Under'` as "player names" instead of real player names.

**Fix:** Swapped `o.name` and `o.description` in the construction of both maps so they become `[market][player][side]`, matching the comment and the access pattern.

**Files changed:**
- `api/save-prop-picks.js` — `scanPropsForEV`: fixed `pinMap` and `bestMap` key order; added one-time debug log of a real prop lookup for verification.

**Verified (logic):**
- Logic test: `oldPinPlayer?.Over?.price = undefined` → `newPinPlayer?.Over?.price = 140` ✓
- The debug log will print one example player/pinPlayer/sides on next cron run for live verification.

---

### Bug 3 — CLV inconsistency: no-vig formula giving counterintuitive/wrong signs

**Root cause:** `api/capture-closing-lines.js` was computing CLV using the **no-vig formula**:
```
clv = (decimalPlaced - fairDecimal) / fairDecimal
where fairDecimal = 1 / (rawClose / (rawClose + rawCloseAway))
```
This formula can give a **negative CLV when the simple ratio gives positive** (e.g. placed=+127 vs close=+124 → no-vig: -0.0074, simple ratio: +0.0134). The bettor clearly beat the closing line (placed at better odds) but the stored value showed negative. Not explainable by rounding.

The intended formula is the simple ratio:
```
CLV = (impliedProb(closing) / impliedProb(placed)) - 1
```

**Files changed:**
- `api/capture-closing-lines.js` — replaced no-vig CLV block with simple ratio. No longer needs `decimalPlaced` or `closing_odds_away` for the computation (still captured and stored for reference). Comment at top and inline updated.
- `scripts/verify-clv.js` — updated `clv_math_mismatch` check from no-vig to simple ratio. Updated explanation note. The 16 historical records (no-vig) will now show as mismatches — expected and documented.
- `admin.html` — updated tooltip: removed "(no-vig vs Pinnacle, stored by cron)" → "(vs Pinnacle closing, stored by cron)". Comment updated.
- `record.html` — same tooltip update.
- `CLAUDE.md` — replaced no-vig formula block with simple ratio definition, sanity examples, and deprecation note for no-vig.
- `capy-gotchas.md` — added entry documenting the 16 historical mismatch records with a Supabase SQL backfill query.

**Verified (formula sanity):**
- placed +106 vs close +116 → -0.0463 (negative ✓)
- placed +148 vs close +139 → +0.0377 (positive ✓)

**verify-clv.js output after change:**
- `clv_math_mismatch: 16` — all 16 are historical no-vig records (expected, documented in gotchas)
- All other anomaly checks: 0 ✓
- New captures going forward will use simple ratio and should show 0 mismatches

---

**Broken / Unverified:**
- Bug 2 fix has NOT been live-tested with a real cron run (no active game window at time of fix). First verification: run `/api/save-prop-picks` during an NBA/MLB game window and check the debug log shows `pinPlayer` with Over/Under prices, plus check Supabase for inserts.
- The 16 historical CLV records still hold no-vig values in DB. Run the SQL in `capy-gotchas.md` to backfill to simple ratio if desired.
- No deploy committed yet — push to git and Vercel to activate.

**Next session starts with:**
1. Deploy to Vercel (git push)
2. Run `/api/save-prop-picks` manually and verify the debug log shows correct pinPlayer shape
3. Check Supabase `prop_picks` table for actual inserts when a qualifying game slate runs
4. Optionally run the SQL backfill from capy-gotchas.md to fix historical CLV records
5. Run `node scripts/verify-clv.js` — expect `clv_math_mismatch: 16` until backfill, then 0

---

## 2026-04-18 (session 22) — prop-admin.html: internal prop_picks debug viewer

**Goal:** Build lightweight internal admin page to inspect prop_picks rows without exposing data publicly.

**Files changed:**
- `prop-admin.html` (new) — standalone password-protected page at `/prop-admin`

**No API changes.** Uses existing `GET /api/get-stats?type=bets&bet_type=prop` with `days`, `sport`, `result` query params.

**Features implemented:**
- Auth gate: same `admin-override.js` ping pattern as admin.html
- Summary bar: Total / Pending / Settled / Official / CLV Captured / Latest picked_at
- Filters: days (7/30/all — server-side), sport, result, ⭐ official-only toggle, player/matchup search (all client-side except days)
- Table: 17 columns (picked_at, game_time, sport, matchup, player, stat, line, side, book, odds, EV%, pin odds, result, official, CLV, event_id, source_page)
- Visual flags: pending/win/loss/push/void badges, ⭐ Official vs Internal, CLV ✓ / Pending, No ID (missing event_id), No Play (is_playable=false)
- Inline row expand (click any row) → shows: market_type, fair_probability, pinnacle_odds_opposing, clv_at_save, clv, closing_odds, closing_captured_at, picked_at, observed_at, event_id, source_page, is_playable, official_pick, stake_units, profit_units, notes

**Verified:**
- `GET /api/get-stats?type=bets&bet_type=prop&days=7` returns correct shape
- API returns 1 row with test data, cleanup returns 0 rows ✓
- all key fields present: player_name, stat_type, official_pick, event_id, source_page, result, closing_captured ✓
- Deploy: `dpl_8uTJB1cNy4feoyrDpK91aLjCE8vN` — READY ✓

**URL:** `https://www.getcapy.co/prop-admin` (requires admin password)

**Next session starts with:**
- Verify page loads in browser and row expand works against real prop_picks data when next cron run produces inserts
- Wire up closing line capture for prop_picks (capture-closing-lines.js still only reads `bets`)

---

## 2026-04-18 (session 21) — Prop-pick storage migrated from bets to prop_picks

**Goal:** Move internal prop-pick storage from the `bets` table to the new dedicated `prop_picks` table.

**Schema:** `prop_picks` table created by user in Supabase. Unique index on `(player_name, market_type, line, over_under, game_time, book) WHERE result NOT IN ('void')`.

**Files changed:**
- `api/save-prop-picks.js` — rewrote Step 1 dedup (bets→prop_picks, tuple-key dedup instead of pick label), Step 5 insert (bets→prop_picks with all new schema fields). Added `market_type`, `event_id`, `matchup`, `homeTeam`/`awayTeam` to event objects. PROP_MAX_DAILY: 3→5. `official_pick=false`, `sharp_book='pinnacle'` set on every row.
- `api/get-stats.js` — `handleBets`: added early-exit to `handlePropBets()` when `bet_type=prop`. New `handlePropBets()` queries `prop_picks`, normalizes column aliases (`fair_probability→true_probability`, `pinnacle_odds_opposing→pinnacle_away_odds`, synthetic `bet_type='prop'`, `date` derived from `game_time`).

**Verified:**
- `GET /api/save-prop-picks` → `{"message":"No qualifying prop picks found","saved":0}` — ran to completion, no DB error, no crash (no EV+ candidates today — expected off-peak result)
- `GET /api/get-stats?type=bets&bet_type=prop` → `{"bets":[]}` — prop_picks table accessible, no error
- Deploy: `dpl_76kDAbVq9UwHiR7NhmiAEw1YS226` — READY ✓

**Unverified:**
- Actual insert into prop_picks with real data (no EV+ picks today — will verify naturally when next qualifying game slate runs)
- `closing_captured` pipeline (capture-closing-lines.js) still targets `bets` table — prop CLV capture not wired up yet

**Next session starts with:**
- Verify first real prop_picks insert via Supabase dashboard or cron logs when next NBA/MLB slate runs
- Wire up closing line capture for prop_picks (capture-closing-lines.js reads from `bets` — needs prop_picks branch)

---

## 2026-04-18 (session 20) — Last 7 Days chart: future/pending bets excluded

**Goal:** Diagnose and fix "Last 7 Days" chart on record.html showing future/tomorrow games.

**Root cause (verified):**
`handleStats` in `api/get-stats.js` built `last7Days` by iterating `normalizedBets` (all non-archived, non-prop game bets) with only a 7-day age cutoff. No filter on `result`. This meant:
- Pending bets with `date` ≥ 7 days ago passed through — including future-dated games
- `bets.date` is set from `game_time.split('T')[0]` (UTC), so a game at `01:39 UTC Apr 19` = `6:39 PM PDT Apr 18` got bucketed under Apr 19
- Void bets contributed `bets++` with `profit_units=null→0`

**Concrete example (live before fix):**
```
2026-04-19 | bets: 3 | wins: 0 | profit: 0  ← FUTURE DATE
  Angels (game_time 2026-04-19T01:39, result: pending)
  Diamondbacks (game_time 2026-04-19T00:11, result: pending)
  Kings (game_time 2026-04-19T19:10, result: pending)

2026-04-18 | bets: 9 | wins: 0 | profit: -1  ← only 1 of 9 was settled
  (8 pending bets inflated the count; only Rockies loss was real)
```

**Fix:**
- `api/get-stats.js` `handleStats`: changed `last7Days` loop source from `normalizedBets` → `resolved`
- `resolved` = `normalizedBets.filter(b => ['win','loss','push'].includes(b.result))` — already defined above the loop; excludes pending, void, and future-dated games

**Verified (live API after deploy):**
```
2026-04-17 | bets: 3 | wins: 1 | profit: -0.52  (was 4 — Orlando Magic pending excluded)
2026-04-18 | bets: 1 | wins: 0 | profit: -1      (was 9 — 8 pending excluded)
2026-04-19 bucket gone entirely ✓
```
Deploy: `dpl_CCxLF9uMwaLvJF5YLN9kjgBU8MFs` — READY ✓

**Broken / unverified:**
- Timezone: `bets.date` is UTC game date, so a game at 01:39 UTC = prior evening US time shows under the UTC date. Not fixed here — would require storing or computing a local-time date at save time. Accepted as known limitation for now.

**Next session starts with:**
- Monitor for any new pending bets leaking back into the chart
- Consider whether `bets.date` should be stored as local (US/Las_Vegas) date for correct day bucketing

---

## 2026-04-18 (session 19) — Duplicate picks on record.html: root cause diagnosed + fixed

**Goal:** Diagnose and fix duplicate picks visible on record.html (Texas Rangers ×2, Minnesota Twins ×2, Colorado Rockies ×2).

**Root causes identified (verified against live DB):**

Three separate issues, all in `api/get-stats.js` `handleRecord`:

1. **`p.results?.length` bug (critical):** `results(*)` join returns a single **object**, not an array. `!p.results?.length` is always `true` (`undefined` → `!undefined = true`), so ALL 55 picks in the 14-day window passed as "pending". The frontend dedup papered over most leakers but not void duplicates.

2. **Pending void duplicates (Texas Rangers, Minnesota Twins):** Cross-midnight duplicate picks (both with no results row, one with bets.result=void) both appeared in pendingPicks. The void bets row was not checked when building pendingPicks.

3. **Resolved duplicates (Colorado Rockies):** Both duplicate picks had their own results rows (outcome=loss). Both appeared in `activeResults`. No dedup existed for resolved vs resolved.

**Files changed:**
- `api/get-stats.js` — `handleRecord`:
  - Fix 1: Changed `pendingPicks` filter from `!p.results?.length || p.results[0]?.outcome === 'pending'` → `!p.results || p.results?.outcome === 'pending'`. pendingPicks reduced from 55 → 17.
  - Fix 2: Added `result` to betsSupp select; moved `betsMap` to outer scope (from `const` inside `if` block to `let` before it).
  - Fix 3: Added `dedupedActive` loop: one row per (pick, game_time.slice(0,16)), preferring the row whose bets.result ≠ 'void'. Moved sharpResults/longshotResults/biggestWinner computation to use `dedupedActive`.
  - Fix 4: Added `dedupedPendingPicks`: filters pendingPicks to exclude those with bets.result='void', then deduplicates by (pick, sport, game_time.slice(0,16)).
  - Return now uses `dedupedActive` and `dedupedPendingPicks`.

**Verified (simulation against live Supabase data):**
- pendingPicks: 55 → 17 (Fix 1) → 13 (Fix 4, void filter + dedup)
- dedupedActive: 38 → 37 (Fix 3, one Rockies duplicate removed)
- Texas Rangers: 1 pending (odds +127, Apr 18) + 2 resolved (Apr 11 loss, Apr 8 win) ✓
- Minnesota Twins: 1 pending (odds -134, Apr 18) + 3 resolved ✓
- Colorado Rockies: 0 pending + 2 resolved (Apr 18 loss, Apr 17 win — different games) ✓
- Syntax check: `node --input-type=module < api/get-stats.js` → exit 0 ✓

**admin.html behavior unchanged:**
- `type=bets` feed (raw bets table, no void filter) → all bets including voided still visible ✓
- `type=record` feed now returns deduped picks (admin also sees deduped record view)

**Broken / unverified:**
- Not yet deployed to Vercel — changes are local only. Deploy and browser-verify record.html shows each team once.
- The partial unique index (`bets_unique_active_pick`) from session 17 was never confirmed created. Without it, future cross-midnight duplicates can still be saved — save-picks.js Step 4b guard is the only runtime protection.

**Next session starts with:**
1. `git push` / deploy to Vercel
2. Open record.html and confirm Texas Rangers, Minnesota Twins, Colorado Rockies each appear exactly once
3. Confirm pending count in admin looks correct (~13 game picks pending)
4. Confirm partial unique index exists: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='bets' AND indexname='bets_unique_active_pick';`

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
