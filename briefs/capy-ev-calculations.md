# GetCapy — Expected Value (EV) Calculations

## Before anything
Back up all current files into /backup-v20/ before touching anything.

---

## Overview
Add Expected Value (EV) calculations to the /odds page and /parlay page. EV is what separates Capy from a basic odds comparison tool — it tells users not just where the best line is, but whether that line is actually mathematically profitable to bet. Display EV clearly, explain it simply, and make it feel like a superpower not a statistics class.

---

## The Math

### Step 1: Calculate no-vig fair odds
For any two-sided market (e.g. moneyline with Team A and Team B):

1. Convert both American odds to implied probability:
   - Positive odds: implied prob = 100 / (odds + 100)
   - Negative odds: implied prob = abs(odds) / (abs(odds) + 100)

2. Sum both implied probabilities (this sum will be > 1.0 because of the vig)

3. Normalize to remove vig:
   - fair prob A = implied prob A / (implied prob A + implied prob B)
   - fair prob B = implied prob B / (implied prob A + implied prob B)

4. Convert fair probabilities back to American odds:
   - If fair prob >= 0.5: fair odds = -(fair prob / (1 - fair prob)) × 100
   - If fair prob < 0.5: fair odds = ((1 - fair prob) / fair prob) × 100

### Step 2: Calculate EV %
Use the BEST available line across all books for this calculation (not just one book):

EV % = (fair prob × potential profit) - ((1 - fair prob) × stake)

Expressed as a percentage of stake:
EV % = (fair prob × (decimal odds - 1)) - (1 - fair prob)
Then multiply by 100 to get percentage

### Step 3: Classify EV
- EV > +3%: "🔥 Strong +EV" (green)
- EV +1% to +3%: "✅ +EV" (light green)
- EV -1% to +1%: "➖ Neutral" (grey)
- EV < -1%: "⚠️ -EV" (red/muted)

### Step 4: Kelly Criterion (show on parlay page and game breakdown, not main odds table)
Kelly % = (fair prob × (decimal odds - 1) - (1 - fair prob)) / (decimal odds - 1)
- This tells the user what % of their bankroll to bet
- Cap display at 25% (never recommend betting more than 25% of bankroll)
- If Kelly is negative, show "No edge — skip this bet"
- Label it: "Kelly suggests: X% of bankroll"
- Add a note: "Kelly is a guide, not a guarantee. Never bet more than you can afford to lose."

---

## Part 1: /odds page EV display

### Per game card (both list and grid view)
- Add an EV badge next to the existing edge badge on each game card
- Show EV for the BEST available line on each side:
  - e.g. "Home ML: 🔥 +4.2% EV at FanDuel"
  - e.g. "Away ML: ✅ +1.8% EV at DraftKings"
- In grid view keep it compact — just the badge and % number
- In list view show slightly more detail

### Per odds cell in the table
- Add a small EV indicator inside or below each odds cell
- Just the classification emoji and % — keep it tiny, don't clutter the cell
- Only show on moneyline rows — spread and totals EV is harder to calculate accurately without sharp line data, show "—" for those for now

### Filter by EV
- Add a new filter option in the filter bar: "Show +EV only" toggle
- When enabled, hide all games where no line has positive EV
- This is a power feature for sharp bettors

---

## Part 2: /parlay page EV display

### Per parlay leg
- Show EV % for each leg in both Capy's suggested parlay and the custom builder
- Show Kelly Criterion suggestion per leg: "Kelly: X% of bankroll"
- Color code: green for +EV legs, grey for neutral, red warning for -EV legs
- If a user adds a -EV leg to their custom parlay show a warning: "⚠️ This leg has negative expected value — it reduces your overall edge"

### Combined parlay EV
- Calculate and display the combined EV of the full parlay
- Combined EV = product of all individual leg EVs (compounding)
- Show it prominently in the parlay summary: "Combined EV: +X%"
- Add a note: "Parlay EV compounds — each leg must be +EV for the parlay to be +EV overall"

### Parlay Kelly sizing
- Show a Kelly recommendation for the whole parlay based on combined EV
- Label: "Kelly suggests: X% of bankroll for this parlay"

---

## Part 3: EV Explanation Section

### Create a dedicated explanation section on /parlay.html
Add a collapsible "How does Capy calculate EV?" section on the parlay page with:

**Heading:** "What is Expected Value and why does it matter?"

**Plain english explanation (write this exactly):**
"Expected Value (EV) is the single most important concept in sports betting. It answers one question: is this bet mathematically profitable over the long run?

A bet is +EV when the odds you're getting are better than the true probability of the outcome. Sportsbooks build in a margin (called the 'vig' or 'juice') so most bets are actually -EV by default. Capy strips out the vig to find the true probability, then checks whether the best available line across all books beats it.

Example: If the true probability of the Lakers winning is 60%, but FanDuel is offering odds that imply only 55% — you're getting a better price than the market thinks is fair. That's +EV. Bet enough +EV spots and you'll be profitable long term.

The Kelly Criterion takes this further — it tells you exactly how much of your bankroll to risk on each +EV bet to maximize long-term growth without going broke."

**Visual diagram:** Show a simple visual:
- A scale/bar showing: [True probability] vs [Implied probability from odds]
- When implied < true = +EV (green)
- When implied > true = -EV (red)

**FAQ items (collapsible):**
1. "Why do I need to remove the vig?" — "Books price both sides so they profit regardless of outcome. The vig inflates implied probabilities. Removing it reveals the true market price."
2. "What EV % should I look for?" — "Anything above +2% is strong. Even +1% adds up over hundreds of bets. Avoid -EV bets."
3. "Is Kelly Criterion safe to use?" — "Kelly maximizes long-term growth but can suggest large bets on high-confidence edges. Many bettors use Half-Kelly (half the suggested %) to be more conservative."

### Add a small EV explainer tooltip on the /odds page
- Next to the EV badge on each game card add a small "?" icon
- Hover/tap shows: "EV = Expected Value. +EV means this line beats the true probability — mathematically profitable long term. Capy removes the bookmaker's margin to find this."

---

## Part 4: Capy's Picks EV integration (odds.html)

- Update Capy's Picks cards to show EV % prominently
- Change the confidence label logic to be EV-based not just edge-based:
  - EV > +3%: "🔥 Strong Pick"
  - EV +1-3%: "✅ Good Value"  
  - EV < +1%: "📊 Best Available Line"
- Add the EV % as a large number on each pick card — make it the hero metric, bigger than the edge score

---

## Important notes
- For spreads and totals, EV calculation requires knowing the sharp/true line which we don't have reliably — show "—" for EV on those rows rather than a potentially wrong number
- All EV calculations should happen client-side in JavaScript using the odds data already being fetched
- Round all EV % to 1 decimal place
- Never show EV on games with missing or incomplete odds data
- Add a small global disclaimer somewhere on the /odds and /parlay pages: "EV calculations are estimates based on market-implied probabilities. Past performance does not guarantee future results. Bet responsibly."

---

## Deliverable
- /backup-v20/ with all current files
- Updated odds.html, parlay.html
- Summary of all changes
- Commit and push when done
