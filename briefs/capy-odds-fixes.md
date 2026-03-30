# GetCapy — Odds Page Fix Prompt

## Before anything
Back up all current files into /backup-v3/ before touching anything.

---

## Fix 1: Edge display for moneyline vs spread bets

The current edge display shows "+700 pt edge" for moneyline differences which is confusing and misleading to casual bettors. A +700 moneyline edge is not the same as a 700 point spread edge.

### Fix
- Detect whether the edge is coming from a moneyline or a spread comparison
- For **moneyline edges**: display as "+$X implied value" or simply show the odds difference like "Best ML: +1200 vs +1000 worst" with a label that says "Moneyline edge" not "pt edge"
- For **spread edges**: keep the current display but label it clearly as "Spread edge: +X pts"
- Update the "What is edge?" explainer banner to explain both types in plain english:
  - "For spreads: edge = difference in points between best and worst available line"
  - "For moneylines: edge = difference in odds across books — a bigger gap means one book is pricing the outcome very differently"
- The Top Edge badge should still work the same way, just the label underneath needs to be accurate

---

## Fix 2: Locked Pro pick cards look like a bug

Currently both locked Pro pick cards show identical text "Unlock all 3 picks with Pro" and look like duplicates. They need to look like distinct, partially visible game cards to create curiosity and feel like a real feature, not a broken UI.

### Fix
- Each locked card should show a blurred/dimmed preview of a real game from today's odds data — pull the 2nd and 3rd highest edge games and use their actual team names and edge scores
- Show the team names and sport emoji clearly at the top of each locked card (not blurred)
- Blur only the specific pick recommendation, odds, and Bet button
- Each card should have a unique "🔒 Pro Pick" badge
- One unlock CTA at the bottom of the section is enough — remove the duplicate unlock buttons on each card and replace with a single banner below all 3 cards: "Unlock all picks + full Capy's Picks with Pro — $7/mo → /#pricing"
- The locked cards should feel like "I can almost see what this is" not "this is broken"

---

## Fix 3: Missing data cells in odds table

Several books show completely blank cells for certain games (Rivers and BetOnline especially). Empty cells look like a broken page to a casual bettor.

### Fix
- Any cell where odds data is missing or null should display a styled "—" dash, centered, in a muted grey color
- The dash should never be confused with actual odds — use a slightly smaller font size and grey color
- Do NOT show an empty white cell — always show something
- If an entire book column is missing for a game, add a small tooltip on hover: "This book doesn't offer odds on this game"

---

## Fix 4: Capy's Picks should show 3 distinct real games

Currently Capy's Picks shows 1 real game and 2 identical lock screens. The section should show the top 3 games by edge as 3 distinct cards.

### Fix
- Pull the top 3 games by edge score from the live odds data
- Card 1 (highest edge): fully visible, free teaser
- Card 2 (2nd highest edge): show team names and edge score, blur the specific pick and bet button — locked for Pro
- Card 3 (3rd highest edge): same as Card 2 — locked for Pro
- All 3 cards should look visually distinct with the actual game info from today's data
- Single unlock CTA below all 3 cards as described in Fix 2

---

## Deliverable
- /backup-v3/ with all current files
- Updated odds.html
- Summary of changes made
- Commit and push when done
