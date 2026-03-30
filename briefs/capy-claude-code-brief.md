# GetCapy — Claude Code Brief

## Before You Touch Anything
**Create a full backup of the current codebase first.**
Copy all current files into a `/backup/` folder at the root of the project before making any changes. This is non-negotiable — the owner wants to be able to revert cleanly.

---

## Context
GetCapy (getcapy.co) is a real-time sports odds comparison tool. The brand is built around the capybara — calm, unbothered, data-driven. The tone should be **confident and sharp, not aggressive or bro-y**. Think "you have better information than everyone else" not "destroy the sportsbooks."

You have full creative freedom on copy and design, but stay true to the existing brand identity: the capybara mascot, the "unbothered" personality, and the green/dark color palette.

---

## Page 1: Homepage (getcapy.co)

### Problems to fix
1. **Affiliate links are broken** — currently hardcoded as placeholder text (`YOUR_DRAFTKINGS_AFFILIATE_LINK` etc.). Replace with each sportsbook's actual homepage:
   - DraftKings → https://draftkings.com
   - FanDuel → https://fanduel.com
   - BetMGM → https://betmgm.com
   - Caesars → https://caesars.com/sportsbook-and-casino

2. **Subheadline is weak** — "Stay unbothered — we'll tell you exactly where the best number is" explains the vibe but not the value. Rewrite to lead with a concrete benefit. Something like: "We scan 5 books every 60 seconds so you always know where the best line is — before it moves."

3. **Testimonials feel fabricated** — "@parlayking · Denver" is not convincing. Either:
   - Rewrite them to feel more specific and credible (real detail, real context), OR
   - Replace the section with a stat block (e.g. "2,400+ bettors on the waitlist · Lines checked every 60s · 5 books tracked")
   - Do NOT keep the current testimonials as-is

4. **CTA is generic** — "Start for free" is fine but the secondary CTA "See live odds" should be more specific: "See today's best lines"

### Design direction
- Keep the headline: "Lines move. Capy doesn't." — it's good
- Increase visual hierarchy on the pricing section — the founding member urgency ("47 spots remaining") should be more prominent
- Make the feature cards feel more alive — consider subtle hover states or iconography upgrades
- Ensure the page looks great on mobile — betting is a phone-first activity

---

## Page 2: /odds

### Problems to fix
1. **Page loads empty** — users see "Fetching live odds..." with nothing to look at. Add a proper skeleton loading state that shows the shape of the content while data loads. Users should never see a blank page.

2. **No ranking or hierarchy** — when odds do load, everything looks equal. The best line should be visually obvious. Implement:
   - Highlight the best available line for each game in green
   - Add an "Edge" indicator showing the difference between best and worst line
   - Sort games by edge size by default (biggest edge at top) with option to sort by time

3. **No methodology explanation** — users don't know why they should trust the numbers. Add a small persistent banner or tooltip that explains: "Edge = difference between the best available line and the market average. Positive edge = value."

4. **No actionable next step per bet** — add a small "Bet now" or book icon link next to the best line for each game that links to that sportsbook's homepage

5. **Page feels static** — add a subtle "last updated X seconds ago" live counter to reinforce that data is fresh

### Design direction
- Green for best line / positive edge
- Red or grey for worst line
- Top 3 highest-edge games should have a visual badge or highlight ("Top Edge")
- Layout should work on mobile — consider a card-per-game layout on small screens instead of a table

---

## Page 3: /stats

### Problems to fix
1. **Blank default state** — "Pick a team to explore" is a dead end. On page load, automatically load a default sport/team (e.g. NBA standings or today's MLB teams) so there's something to look at immediately.

2. **No guidance** — first-time users don't know what they're looking for. Add a brief intro line at the top: "Explore team standings, player props, and injury reports. Select a sport to get started."

3. **Sidebar is overwhelming** — listing every sport/league at once is too much. Consider collapsing leagues under sport headers (Football → NFL, NCAAF, UFL) and defaulting to the most popular ones expanded.

4. **No connection to odds** — stats and odds should feel linked. When viewing a team, show a small "View their next game odds →" link that takes the user to the /odds page filtered to that team's next game.

### Design direction
- Default load state should feel useful, not empty
- Keep the sidebar but make it collapsible by sport category
- Player stats should be scannable — use a clean table with sortable columns
- Injury status should be color-coded: green (active), yellow (questionable), red (out)

---

## General / Cross-Site

- **Mobile first** — test every change at 390px width (iPhone 15 size)
- **Keep the capybara** — the mascot and brand personality are a strength, not a gimmick. Lean into it.
- **Performance** — the /odds page JS loading is fragile. Add error states for when data fails to load, not just loading states.
- **No lorem ipsum, no placeholder text** — every string in the final output should be real copy

---

## Deliverable
- `/backup/` folder with original files untouched
- Updated homepage, /odds page, /stats page
- Brief summary of what was changed and why
