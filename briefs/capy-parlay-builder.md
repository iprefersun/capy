# GetCapy — Parlay Builder

## Before anything
Back up all current files into /backup-v18/ before touching anything.

---

## Overview
Build a Parlay Builder feature for GetCapy. It lives on its own page (/parlay.html), is promoted across all pages, and is accessible from each game card on the /odds page. It is free for all users for now.

---

## Page 1: /parlay.html

### Layout
- Same navbar as the rest of the site with dark mode toggle
- Page title: "🦫 Capy Parlay Builder"
- Subtitle: "We find the edges. You build the parlay."
- Two column layout on desktop:
  - Left (60%): Parlay builder / leg selector
  - Right (40%): Capy's Suggested Parlay + your custom parlay summary

### Capy's Suggested Parlay (right column, top)
- Automatically pulls the top 3 highest edge games from today's live odds data
- Displays them as a pre-built parlay with:
  - Each leg showing: sport emoji, teams, recommended pick, best available line, which book
  - Combined parlay odds (calculate by multiplying decimal odds of each leg)
  - A confidence label: "🔥 Strong Parlay" / "✅ Good Value Parlay" based on average edge
  - A "Copy this parlay" button that copies the legs to the custom builder
  - A "Bet this parlay" button — for now link to BetOnline affiliate link: https://record.betonlineaffiliates.ag/_otQU8R9fzqnYJMJFEJBL7mNd7ZgqdRLk/1/
- Label it clearly: "Capy's Pick — Updated every 60 seconds"
- Refresh automatically with the odds data

### Custom Parlay Builder (left column)
- Shows all of today's games as selectable cards
- Each game card shows:
  - Sport emoji + team names
  - Game time
  - Edge badge
  - Three buttons for each game: [Home ML] [Away ML] [Spread] — clicking one adds that leg to the parlay
  - Active/selected state when a leg is added (green border, checkmark)
- Users can add up to 10 legs
- A selected leg can be clicked again to remove it

### Parlay Summary (right column, below Capy's suggestion)
- Shows the user's custom built parlay as they add legs:
  - Each leg listed with: teams, pick, odds, book
  - Running combined odds updated in real time as legs are added
  - Potential payout calculator: input field for bet amount ($), shows potential payout
  - "Clear parlay" button
  - "Bet this parlay" button linking to BetOnline affiliate link
- If no legs selected yet show: "Add games from the left to build your parlay 🦫"

### Parlay odds calculation
- Convert American odds to decimal for calculation:
  - Positive odds: decimal = (odds/100) + 1
  - Negative odds: decimal = (100/abs(odds)) + 1
- Multiply all decimal odds together for combined parlay odds
- Convert back to American for display
- Show potential payout as: bet amount × combined decimal odds

### Edge/EV indicator per leg
- For each leg in the parlay show a small EV indicator:
  - Calculate no-vig fair odds by stripping the juice from both sides
  - If the selected line is better than the no-vig fair odds label it "+EV ✅"
  - If worse label it "-EV ⚠️"
  - Add a hover tooltip explaining: "EV = Expected Value. +EV means this line is mathematically profitable long term based on the market's implied probability."

---

## Part 2: Promote parlay builder across the site

### Navbar (all pages)
- Add "Parlay" as a nav link on all pages: index.html, odds.html, stats.html, game.html
- Position it between "Live odds" and "Stats" in the nav

### /odds page game cards
- Add a small "➕ Add to parlay" button on each game card in both list and grid view
- Clicking it adds that game's best edge pick as a leg to the parlay builder
- Show a small toast notification: "Added to parlay → View parlay" that links to /parlay.html
- Keep a persistent parlay counter in the navbar: "🎰 Parlay (2)" showing how many legs are currently selected — clicking it goes to /parlay.html
- Store selected parlay legs in localStorage so they persist when navigating to /parlay.html

### Homepage (index.html)
- Add a new feature card in the features section:
  "🎰 Parlay Builder — Capy builds the best parlay from today's edges. Customize it or bet it as-is."
- Add a small promo banner between the hero and features section:
  "New: 🎰 Capy Parlay Builder — Today's best edges, auto-built into a parlay. Try it free →" linking to /parlay.html
  Style it as an amber/green pill banner, subtle but noticeable

---

## Part 3: Design direction

- Parlay page should feel exciting and action-oriented — this is the most "bet now" page on the site
- Use green heavily for selected legs, positive EV, strong confidence
- Use the capybara mascot/emoji prominently on this page — it's the most fun feature
- Combined odds should be displayed large and bold — that's the exciting number people want to see
- Potential payout should update in real time as the user types the bet amount
- Dark mode should work perfectly on this page following the same pattern as other pages
- Mobile: stack to single column, parlay summary sticks to bottom of screen as a fixed bar showing leg count and combined odds with a "View parlay" button

---

## Deliverable
- /backup-v18/ with all current files
- New /parlay.html
- Updated index.html, odds.html, stats.html, game.html (nav link + game card button)
- Summary of all changes
- Commit and push when done
