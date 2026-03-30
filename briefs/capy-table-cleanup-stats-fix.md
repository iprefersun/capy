# GetCapy — Odds Table Visual Cleanup + Stats Fix

## Before anything
Back up all current files into /backup-v8/ before touching anything.

---

## Part 1: Odds Table Visual Cleanup

### Fix 1: Font consistency in table cells
The green highlighted cells (best line) appear bolder or a different weight than other cells which looks inconsistent and weird. Fix this so:
- All odds cells use the exact same font, font-weight, and font-size regardless of whether they are green, red, soft green, or neutral
- The only visual difference between a best line cell and a normal cell should be the background color — not the font weight, size, or family
- Make sure the Bet → link inside a green cell doesn't affect the font rendering of the odds number next to it

### Fix 2: Book name abbreviations
Currently column headers show FD, DK, MGM etc. which not everyone will recognize. Fix:
- Spell out full book names in the column headers: FanDuel, DraftKings, BetMGM, Caesars, BetOnline
- If the full names make the table too wide on desktop, use abbreviated names but add a tooltip on hover that shows the full name
- On mobile, use short names but make sure they don't overlap or get cut off

### Fix 3: Row labels
Make bet type labels more descriptive and casual-bettor friendly:
- "Bulls ML" → "Bulls to win"
- "Spurs ML" → "Spurs to win"
- "Bulls spread" → "Bulls -3.5 (spread)"
- "Over" → "Over 224.5 points"
- "Under" → "Under 224.5 points"
- The actual line number should be in the label so users know what they're betting at a glance

### Fix 4: Bet type explanation tooltips
Add a small "?" icon next to each bet type category (Moneyline, Spread, Total) in the table. On hover show a one sentence plain english explanation:
- Moneyline: "Pick which team wins outright. Negative odds = favorite, positive odds = underdog."
- Spread: "Bet on the margin of victory. The favorite must win by more than the spread."
- Total: "Bet on the combined score of both teams going over or under a set number."
The tooltip should be styled consistently with the rest of the page — soft dark background, white text, small arrow pointer.

### Fix 5: Visual legend
Add a small legend bar directly above the odds table for each game:
"🟢 Best line available  🔴 Worst line  ⚪ All books equal"
Keep it small and subtle — one line, muted colors, doesn't distract from the table.

### Fix 6: Alternating row colors
Add subtle alternating row background colors to the odds table so the eye tracks across each row easily. Use a very subtle difference — almost invisible but enough to separate rows. Should work with both the green/red highlights (don't let alternating rows override highlight colors).

### Fix 7: Number alignment
All odds numbers in cells should be right-aligned so the +/- signs and digits line up vertically in each column. Currently mixed alignment makes the table harder to scan.

### Fix 8: Row padding
Increase row padding slightly — currently feels cramped. Add 2-4px more vertical padding per cell so the table breathes a bit more without becoming too tall.

### Fix 9: Mobile layout
On mobile (under 640px width):
- Switch from a wide table to a card-per-bet-type layout
- Each card shows the bet type (e.g. "Moneyline") and lists each book with its odds in a clean vertical list
- Best line highlighted green, worst highlighted red
- Full book names on mobile since they're in a list not a table header
- "Bet →" button full width on mobile under the best line

---

## Part 2: Stats and Game Breakdown Fix

### Fix 1: Player stats instead of empty team stats
The team stats fields (points per game, opp points per game) are showing — dashes because BallDontLie free tier doesn't reliably provide team-level stats. Remove those fields entirely and replace with a "Top Players This Season" table showing the top 8 players by points per game with columns: Player, Pos, PTS, REB, AST. This is more useful than empty team stats anyway.

### Fix 2: Shape the API response correctly
The stats.js API is returning raw data that the frontend isn't mapping correctly. Update stats.js to return a clean shaped object:
- team: { full_name, record }
- players: array of top 8 players by pts, each with { name, position, pts, reb, ast }
- If any field is unavailable return null — never show a — dash without first trying to fetch the data

### Fix 3: Head to head upcoming games
Games that haven't started yet are showing as "0-0 Thunder L" which is wrong. Fix so:
- Games that haven't started show as "Upcoming" with the scheduled tip-off time
- Only show a score if the game is in progress or final
- Never show 0-0 as a score

### Fix 4: Injury report note
The injury report section shows "No injuries reported" with no context. Add a small note below: "Injury data updates daily — check back closer to tip-off" so users know it's not broken.

### Fix 5: Season year
Double check stats.js is using the correct season parameter for BallDontLie. The 2024-25 NBA season should use season=2024. Verify this is correct and if BallDontLie uses a different value for the current season, update it.

---

## Part 3: Moneyline Edge Display Fix

The Capy's Picks cards currently show moneyline edge as a raw number (e.g. "+700 ML") which looks like an odds line not an edge score and confuses casual bettors.

Fix:
- For moneyline-only edges remove the numerical edge badge entirely
- Replace with badge text: "Best ML Available"
- Description should show plain english comparison: "FanDuel has the best line at +1200 vs +1000 at other books"
- Never show the raw arithmetic difference between moneyline odds as if it were a point spread
- Only show a numerical edge score for spread edges where the number is intuitive (e.g. "+1.5 pts")
- Update the confidence label logic so moneyline-only games don't get "🔥 Strong Pick" based purely on ML odds difference — instead label them "📊 Best Available Line"

---

## Deliverable
- /backup-v8/ with all current files
- Updated odds.html, game.html (or wherever the breakdown page lives), api/stats.js
- Summary of every change made
- Flag any placeholders or data gaps that need real data
- Commit and push when done
