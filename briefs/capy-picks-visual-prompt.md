# GetCapy — Capy's Picks + Visual Overhaul

## Before anything
Back up all current files into /backup-v2/ before touching anything.

---

## Context
GetCapy has two types of users:
- **Sharp bettors (Free tier)** — know what they're looking for, want raw data and full control
- **Casual bettors (Pro tier)** — want to be told what to do, pay for the curation and simplicity

The free /odds page stays as the full data table for sharps. We're adding a "Capy's Picks" section for Pro users and making both pages more visually exciting and approachable for casual bettors who may never have used an odds tool before.

---

## Task 1: "Capy's Picks" section on /odds page

### Logic
- Automatically pull the top 3 games from the live odds data, ranked by edge score (best available line minus worst available line)
- Display them ABOVE the full odds table as a distinct "Capy's Picks" section
- These should feel like a trusted friend's recommendation, not a data output

### Card design for each pick
Each pick card should include:
- Sport emoji + team names (e.g. 🏀 Lakers vs Celtics)
- The recommended bet in plain english (e.g. "Take Lakers -3.5 at DraftKings")
- Best available line and which book it's at
- Edge badge (e.g. "+4.5 edge")
- A confidence label based on edge size:
  - Edge > 6: "🔥 Strong Pick"
  - Edge 3–6: "✅ Good Value"
  - Edge < 3: "👀 Worth a Look"
- A single prominent "Bet at [Book] →" button that links to that sportsbook's homepage
- A one-line plain english reason: e.g. "DraftKings is offering the best number on this game by 4.5 points — that's a meaningful edge."

### Pro gate
- If the user is on the Free tier, show the Capy's Picks section but blur/lock 2 of the 3 cards
- Show a clear upgrade prompt: "Unlock all picks with Pro — $7/mo" with a link to /#pricing
- The first card is always visible as a teaser

### Section header
"🦫 Capy's Picks — Today's Best Lines"
Subtext: "We scanned 5 books and found these edges. Updated every 60 seconds."

---

## Task 2: Visual overhaul — /odds page

The current page feels functional but flat. Make it feel alive and exciting without losing clarity.

### Changes
- Add a subtle animated gradient or pulse effect to the "Top Edge" badge so it draws the eye
- Best line cells should have a clear green background highlight — not just a text color change, an actual filled cell so it's obvious at a glance even to someone who's never used an odds tool
- Worst line cells should be a muted red/grey so the contrast is stark
- Game cards should have a hover state — slight lift (box-shadow) and border highlight on hover
- The edge score should be displayed large and prominent on each game card, not buried
- Add sport-specific emoji to each game card header (🏀 NBA, 🏈 NFL, ⚾ MLB, 🏒 NHL etc.)
- The methodology banner ("What is edge?") should be visually distinct — use a soft green background card with a 🦫 emoji and friendly tone, not a plain text bar

### Mobile
- Game cards should stack into a single column on mobile
- The "Bet →" button should be full width on mobile
- Capy's Picks cards should be horizontally scrollable on mobile (snap scroll, show 1.2 cards to hint there are more)

---

## Task 3: Visual overhaul — Homepage

The homepage needs to immediately communicate value to someone who has never heard of sports betting odds tools. Make it visually exciting and self-explanatory.

### Hero section
- Keep the headline: "Lines move. Capy doesn't."
- Rewrite the subheadline to be even more concrete: "We watch DraftKings, FanDuel, BetMGM, Caesars and PointsBet every 60 seconds — and tell you exactly where the best line is before it moves."
- Add a live mini-preview widget below the CTAs — a small card showing 1 real or realistic example game with the odds comparison across books. Should look like a teaser of the actual product. Label it "Live example" or "Updated just now"
- This gives casual visitors an instant visual of what they're signing up for

### Features section
- Current feature cards are flat and icon-heavy. Make them more visual:
  - Each card should have a subtle background illustration or gradient that hints at the feature
  - Add a short "who this is for" line under each feature description e.g. "Perfect for bettors who want to catch line movement early"
- Reorder features so the most casual-friendly ones come first: Best bet radar → Live odds comparison → Injury reports → Line movement alerts → CLV tracking → Team stats

### Social proof / stats bar
- The stat block that replaced testimonials (2,400+ waitlist, 60s refresh, 5 books) should be more visually prominent
- Make it a full-width banner with large numbers and short labels, not small cards
- Add a fourth stat: "Avg edge found per game: +3.2 pts" (this is a made-up but plausible placeholder — flag it so the owner can verify or adjust)

### Pricing section
- Add a short sentence above the pricing cards aimed at casuals: "Not sure which plan? Most bettors start free and upgrade when they want Capy to just tell them the best bet."
- The Pro card should visually pop more — consider a glowing border or accent color vs the other cards

### General visual direction
- Consider adding a subtle capybara watermark or texture element to section backgrounds to reinforce the brand personality
- The page should feel warmer and more inviting in the hero — right now it's dark and slightly cold for a casual audience
- Add micro-animations: fade-in on scroll for feature cards, number count-up animation for the stats bar

---

## Deliverable
- /backup-v2/ with all original files
- Updated index.html, odds.html
- Summary of every change made
- Flag any placeholders that the owner needs to fill in with real data (e.g. the avg edge stat)
- Commit and push when done
