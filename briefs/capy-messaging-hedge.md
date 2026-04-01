# GetCapy — Messaging Upgrade + Protect My Parlay Hedge Tool

## Before anything
Back up all current files into /backup-v27/ before touching anything.

---

## Part 1: Messaging & Label Upgrades

### Goal
Now that Pinnacle is live as the sharp line reference, update all labels and copy across the site to reflect this upgrade. Capy is no longer just an "odds comparison tool" — it's a market inefficiency detector using sharp book pricing. Every label should reflect this.

### odds.html

#### Capy's Picks section header
- Change: "🦫 Capy's Picks — Today's Best Lines"
- To: "🦫 Capy's Picks — Market Inefficiencies vs Sharp Line"
- Change subtext: "These edges won't last. Lines move fast — act before the window closes."
- To: "Comparing all books against Pinnacle (sharp market) to find genuine pricing gaps."

#### Edge/EV labels on game cards
Replace all instances of "Top edges today" with context-aware labels:
- If EV > +2% vs Pinnacle: "🔥 +EV vs Pinnacle"
- If EV +0.5% to +2%: "✅ Edge vs Sharp Line"
- If EV 0% to +0.5%: "➖ Marginal Edge"
- If EV negative: "📊 Best Available (Negative EV)" — never call a negative EV bet a "top edge"

#### Per game card — add Pinnacle comparison overlay
In both list and grid view, add a small "vs Pinnacle" row to each game card showing:
- Best available US book line vs Pinnacle fair odds
- Format: "FanDuel +128 vs Pinnacle fair +115 → +2.6% EV"
- Only show this row when Pinnacle data is available for that game
- If no Pinnacle data: show "📍 vs Market average" instead
- Keep it compact — one line, small font, muted color unless EV is positive (green if positive)

#### Filter bar
- Add a new filter pill: "📍 +EV vs Pinnacle only"
- When active: only show games where at least one side has positive EV vs Pinnacle
- This is the power filter for sharp bettors

#### Methodology banner
Update the "What is edge?" banner to:
"Capy compares every major US book against Pinnacle — the sharpest market in the world. When a US book offers better odds than Pinnacle's fair price, that's a genuine edge. Green = beating the sharp line. Everything else = you're paying the house."

### index.html

#### Hero subheadline
Change to: "We compare every major sportsbook against the sharpest odds in the world. When we find a gap — that's your edge."

#### Feature card: Best bet radar
Change description to: "AI-ranked market inefficiencies updated every minute. We flag when US books misprice vs the sharp market."

#### Feature card: Live odds comparison  
Change description to: "Every book vs the sharp line. Know instantly when the market is offering you value — before it corrects."

#### Stats banner
Add a fourth stat: "📍 Sharp reference: Pinnacle" — this tells visitors immediately what makes Capy different

#### Pricing section — Pro tier
Add to Pro features list: "📍 Full vs Pinnacle EV breakdown"

### parlay.html

#### Page subtitle
Change: "We find the edges. You build the parlay."
To: "Build parlays from genuine market inefficiencies — not just good-looking lines."

#### Capy's suggested parlay
Change confidence label logic:
- Only label a suggested parlay "🔥 Strong Parlay" if combined EV vs Pinnacle is positive
- If negative EV: label it "🎰 High Upside Parlay (Negative EV — entertainment play)"
- Never suggest a negative EV parlay as if it's a smart bet

#### Per leg EV display
Update format to: "+2.3% vs Pinnacle" or "-1.2% vs Pinnacle" so the reference is always clear

---

## Part 2: Protect My Parlay — Hedge Calculator

### Overview
Add a "Protect My Parlay 🛡️" section to parlay.html. This tool takes the user's current parlay and calculates the optimal hedge bet to either guarantee profit or minimize loss. It works in two modes: pre-game and live (mid-parlay).

### UI placement
- Add a new section below the parlay summary on the right column of parlay.html
- Header: "🛡️ Protect My Parlay"
- Subtext: "Already have a parlay running? Find the optimal hedge to lock profit or cut losses."
- Collapsed by default, expands when clicked

### Pre-game hedge calculator
Inputs:
- Original stake amount ($)
- Current parlay odds (auto-filled from their built parlay, or manually entered)
- Which legs have already won (checkboxes for each leg)
- Remaining legs (auto-filled or manual)

Calculations:
1. Calculate potential parlay payout: stake × decimal parlay odds
2. For each remaining leg, calculate hedge bet on the OPPOSITE outcome:
   - Hedge amount = potential payout / (decimal odds of opposite + 1)
   - This guarantees the same profit regardless of outcome
3. Show two scenarios:
   - "Hedge to guarantee profit": exact bet amount and which side to bet
   - "Partial hedge (Half Kelly)": bet half the full hedge for upside with reduced risk

Output display:
- "Your parlay pays: $X if all legs win"
- "Hedge bet: $Y on [Opposite Team] at [Best Available Odds] at [Book]"
- "Guaranteed profit if hedged: $Z (regardless of outcome)"
- "Unhedged upside: $X (if parlay hits without hedge)"
- A slider: "How much do you want to protect?" — 0% (no hedge) to 100% (full guarantee) with the bet amount updating in real time as the slider moves

### Live hedge calculator (2+ legs already hit)
When user checks off legs as "Won":
- Recalculate the remaining parlay odds based on remaining legs only
- Show updated potential payout
- Show optimal hedge on the final remaining leg
- Label it: "🔥 Lock profit now — hedge the final leg"
- Show: "If you hedge $X on [Opposite], you guarantee $Y profit no matter what"
- Show: "If you don't hedge and it hits, you win $Z"
- Show: "If you don't hedge and it misses, you lose your original $[stake]"

### Best hedge line finder
- For each hedge bet recommended, automatically find the best available odds for that side across all books
- Show: "Best odds for your hedge: [Team] [Odds] at [Book] → [Affiliate link]"
- Use existing affiliate links for book links

### Hedge math explainer
Add a collapsible "How does hedging work?" section:
"Hedging means betting on the opposite outcome of one or more of your parlay legs. Done correctly, it guarantees you profit regardless of the final result — at the cost of reducing your maximum payout. The key is timing: hedge too early and you sacrifice upside. Hedge at the right moment (when you have 1-2 legs left and the payout is large) and you can lock real money."

### Mobile layout
- On mobile the hedge calculator stacks below the parlay summary
- The slider should be touch-friendly (large hit area)
- All monetary outputs should be large and easy to read

---

## Part 3: CLV Tracker teaser (UI only, no backend yet)

Add a locked/teased "📈 Closing Line Value Tracker" section to parlay.html and odds.html:
- Show a grayed out preview of what CLV tracking looks like
- Label: "Coming soon — track whether your picks beat the closing line"
- Small description: "CLV is how pros measure edge. If your picks consistently close better than where you bet, you're beating the market — even when individual bets lose."
- Link to /#pricing with "Available in Sharp tier"
- This plants the seed for the feature without building the backend yet

---

## Important notes
- All EV labels must always specify the reference: "vs Pinnacle" or "vs Market" — never just show a % with no context
- Negative EV should never be hidden but should never be labeled as a positive signal
- The hedge calculator math must be accurate — double check all formulas before finalizing
- Never recommend a hedge bet without showing the math behind it
- Add disclaimer near hedge calculator: "Hedge calculations are estimates. Always verify odds before placing. Lines move."

---

## Deliverable
- /backup-v27/ with all current files
- Updated index.html, odds.html, parlay.html
- Summary of all changes made
- Flag any math that needs verification
- Commit and push when done
