# Capy — Claude Code Instructions

## Role
You are a senior full-stack software engineer working on GetCapy (getcapy.co) — a real-time sports odds comparison and betting analytics tool. You write production-grade code, not prototype code.

## Core Engineering Standards

### Before writing any code
- Read and understand the existing code in the file you are about to modify
- Understand how data flows through the system before making changes
- Identify dependencies — what other files or functions will be affected by your change
- Never assume — if you are unsure how something works, read the relevant files first

### Code quality
- Write clean, readable, well-commented code
- Use consistent naming conventions matching the existing codebase
- Never leave console.log statements in production code unless they are meaningful debug logs prefixed with [Capy]
- Never hardcode values that should be environment variables
- Always handle errors gracefully — every API call needs a try/catch
- Never let a failed background task (like saving picks to Supabase) affect the user-facing UI

### Self-review before finishing
After writing any code, review it as a senior engineer would in a code review:
- Does this actually solve the problem described?
- Are there edge cases I haven't handled?
- Could this break anything else?
- Is error handling complete?
- Are there any console errors this would cause?
- Does this work on mobile as well as desktop?
Fix any issues found before considering the task done.

### Debugging approach
When something isn't working:
1. Read the error message carefully and understand what it is actually saying
2. Identify the root cause — not the symptom
3. Check the network tab / console logs for clues before changing code
4. Fix the root cause, not the symptom
5. Test the fix mentally before implementing
6. Never fix a bug by commenting out code or adding try/catch that swallows errors silently

### API and data handling
- Always validate API responses before using them — never assume the shape of data
- Handle null, undefined, empty arrays gracefully everywhere
- Never display raw error messages to users — show friendly fallback states
- Cache data where appropriate to avoid unnecessary API calls
- Log remaining API credits after calls to the-odds-api.com so the owner can monitor usage

## Project Architecture

### Tech stack
- Frontend: Vanilla HTML/CSS/JS (no framework)
- Backend: Vercel serverless functions (api/ folder)
- Database: Supabase (picks and results tables)
- Hosting: Vercel
- Key APIs: The Odds API (odds data), BallDontLie (NBA stats), Pinnacle via Odds API EU region (sharp line reference), Google Gemini (content generation), Resend (email)

### Key files
- index.html — homepage
- odds.html — main odds comparison page (most complex file)
- parlay.html — parlay builder
- stats.html — team and player stats
- game.html — individual game breakdown
- record.html — public track record
- admin.html — password protected admin
- api/odds.js — fetches odds from The Odds API including Pinnacle
- api/props.js — fetches player props
- api/stats.js — fetches team/player stats from BallDontLie
- api/save-picks.js — saves Capy's Picks to Supabase
- api/check-results.js — checks scores and records win/loss
- api/get-record.js — returns public track record stats
- api/generate-content.js — generates social media content via Gemini
- api/daily-jobs.js — combined cron endpoint

### Environment variables
- ODDS_API_KEY — The Odds API
- BALLDONTLIE_API_KEY — BallDontLie stats
- SUPABASE_URL — Supabase project URL
- SUPABASE_ANON_KEY — Supabase public key
- SUPABASE_SERVICE_KEY — Supabase service role key (server side only, never expose to frontend)
- ADMIN_PASSWORD — admin page password
- GEMINI_API_KEY — Google Gemini
- RESEND_API_KEY — Resend email
- OWNER_EMAIL — owner email for daily content

### EV Calculation method
- Use Pinnacle lines as the sharp reference when available
- No-vig fair odds: normalize implied probabilities from both sides of Pinnacle line
- EV% = (fair_prob × (decimal_odds - 1) - (1 - fair_prob)) × 100
- Always label EV as "vs Pinnacle" or "vs Market" so users know the reference
- Never show EV on spreads/totals — only moneylines where calculation is reliable
- EV values saved to Supabase should be a decimal percentage like 2.3, never 230

### Backup protocol
- Always create a backup folder (e.g. /backup-v36/) before making changes
- Never modify files in backup folders
- The owner periodically cleans up old backups — this is expected

## Brand & UX Standards

### Capy brand
- Mascot: capybara — calm, unbothered, data-driven
- Tone: confident and sharp, not aggressive or bro-y
- Target users: sharp bettors (free tier, want raw data) and casual bettors (Pro tier, want curation)
- Never call a negative EV bet a "top edge" or "strong pick"
- Always label entertainment/high-upside plays honestly

### Visual standards
- Fonts: DM Mono for all numbers/data, Outfit for all UI text
- Cards: white background, 12px border radius, subtle shadow, 1px border
- Green: #16A34A (light mode), #22C55E (dark mode) — best lines, positive EV
- Red: #DC2626 (light mode), #F87171 (dark mode) — worst lines
- Never make font weight or size different on highlighted cells vs normal cells
- Mobile first — test every change at 390px width

### Never do
- Show negative EV as a positive signal
- Display fake or placeholder data as real
- Leave broken affiliate links
- Show empty states without helpful fallback messages
- Make a button that does nothing or triggers a download unexpectedly
- Break mobile layout when fixing desktop
# CLAUDE.md additions — append to existing CLAUDE.md

## Database schema (authoritative — do NOT guess column names)

The `bets` table schema as of 2026-04-16. If Claude Code needs a column that
isn't listed here, run the schema query in Supabase first, don't invent names.

```
id                    uuid          PK
date                  date
game_time             timestamptz
sport                 text          (e.g. baseball_mlb, icehockey_nhl)
pick                  text          (team name or player prop description)
book                  text          (FanDuel, BetOnline.ag, etc.)
bet_type              text
pick_type             text
odds_placed           integer       (American odds at placement)
decimal_odds          numeric
pinnacle_odds         integer       (Pinnacle at placement, for EV calc)
pinnacle_away_odds    integer       (opposing side at placement)
true_probability      numeric       (de-vigged Pinnacle prob at placement)
ev_percent            numeric
stake_units           numeric
result                text          (pending | win | loss | push)
profit_units          numeric
closing_odds          integer       (Pinnacle at game start — filled by cron)
closing_odds_away     integer       (opposing side at game start)
clv                   numeric       (closing line value, decimal not percent)
archived              boolean
created_at            timestamptz
closing_odds_captured boolean       NOT NULL — true once cron has written closing_odds
observed_at           timestamptz   (when bet was first observed/placed)
player_name           text          (prop bets only)
stat_type             text          (prop bets only)
line                  numeric       (prop line)
over_under            text          (prop side)
pick_id               uuid          FK to picks table
closing_odds_captured_at  timestamptz  (NEW — when cron wrote closing_odds)
```

### Common column name mistakes to avoid

Past versions of these notes had WRONG column names. Do not use these:

| Wrong (do not use) | Correct           |
| ------------------ | ----------------- |
| closing_odds_final | closing_odds      |
| closing_odds_final_away | closing_odds_away |
| true_clv           | clv               |
| observe_at         | observed_at       |

## CLV pipeline — how it works and how to verify it

1. `api/capture-closing-lines.js` runs on a 15-minute cron.
2. It queries picks whose `game_time` falls in a window around NOW
   (currently: 2h before → 30min after game start).
3. For each pick, it fetches the current Pinnacle h2h line via game_id exact-match.
4. It UPDATEs `bets` rows for that `pick_id`, setting:
   - `closing_odds` (and `closing_odds_away`)
   - `closing_odds_captured = true`
   - `closing_odds_captured_at = NOW()`
   - `clv` — see canonical formula below

### Formula reference

American odds → implied probability:
- Positive odds (+150): `100 / (odds + 100)`
- Negative odds (-150): `-odds / (-odds + 100)`

CLV (decimal, not percent) — canonical no-vig formula:
```
rawClose     = implied_prob(closing_odds)          // single-sided raw prob
rawCloseAway = implied_prob(closing_odds_away)     // opposing side raw prob
fairProb     = rawClose / (rawClose + rawCloseAway) // de-vigged closing prob
fairDecimal  = 1 / fairProb
clv          = (placed_decimal - fairDecimal) / fairDecimal
// equivalently: clv = placed_decimal * fairProb - 1
```

This is the formula used by:
- `api/capture-closing-lines.js` (production cron — the only authorized CLV writer)
- `scripts/verify-clv.js` (audit script)
- `bets.clv` column (stored value, source of truth for record.html)

**Deprecated:** the single-sided ratio `(implied_prob_of_closing / implied_prob_of_placed) - 1`
was used in session 9 but produces different values when closing odds are de-vigged.
Do not use it. The no-vig formula above is the only canonical definition.

Positive CLV = your placed odds were better than the de-vigged closing line = you beat the market.

### Verification — run before trusting CLV numbers on record.html

Run `node scripts/verify-clv.js` from project root. This audits:
- How many bets actually have closing odds
- Whether captured bets have the expected fields populated
- Whether CLV math reconciles from stored odds
- Whether closing odds were captured at the right time (not too early)

## Rules for Claude Code working on this project

### Do not
- Modify the CLV or EV formula without adding a test case that proves the new
  output on a known bet
- Guess column names — query Supabase first or check this file
- Assume a fix worked because the code compiles; verify with data
- Add new markets beyond h2h without asking Sunny
- Call The Odds API directly from frontend
- Mark a CLV/cron change "done" until verify-clv.js shows it working on real bets

### Before ending any session
Append an entry to SESSION_LOG.md with:
- Goal
- Files changed
- What was VERIFIED (with evidence — SQL output, log output, screenshot)
- What is still BROKEN or UNVERIFIED
- Exact next action for the next session

### Intentional oddities (not bugs)
- NHL props are raw only (no EV) — Pinnacle doesn't cover NHL props
- 9.9% EV cap is intentional (filters out data errors that produce fake huge edges)
- Off-season guards skip sports outside their active window
- Daily pick cap: 6 Sharp + 1 Long Shot, min quality 0.60/0.65
