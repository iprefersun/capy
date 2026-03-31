# GetCapy — Conversion & Urgency Overhaul

## Before anything
Back up all current files into /backup-v17/ before touching anything.

---

## Goal
Shift the site messaging from "here's a cool tool" to "you're losing money every time you bet without this." Every change should make visitors feel the pain of NOT using Capy, not just the benefit of using it.

---

## Part 1: Homepage copy overhaul (index.html)

### Hero section
- Change the subheadline from the current version to: "The average bettor loses hundreds of dollars a year betting at the wrong book. Capy finds the best line in seconds — for free."
- Add a small urgency line under the CTA buttons: "⚡ 2,400+ bettors already have the edge. You don't yet."
- Keep the headline "Lines move. Capy doesn't." — it's good

### New "cost of not using Capy" section
Add a new section between the hero and the features section with the heading: "What bad lines are actually costing you"
Content:
- Three stat cards side by side:
  1. "~$340/year — what the average bettor loses betting at one book instead of shopping lines"
  2. "+0.5 to 3 pts — the edge you're giving away on a typical game by not comparing books"
  3. "60 seconds — how long it takes Capy to find you the best line across 5 books"
- Under the cards: "Capy Pro costs $7/month. One better line pays for a year."
- Style these cards with a dark background and green accent numbers to make the stats pop
- Add a small disclaimer in muted text: "Average figures based on industry estimates. Individual results vary."

### Features section reorder and rewrite
Reorder features so the most impactful ones come first and rewrite descriptions to lead with loss/urgency:
1. 🎯 Best bet radar — "Stop guessing. AI-ranked value plays updated every minute so you never miss an edge."
2. 📊 Live odds comparison — "5 books. 1 dashboard. The best line highlighted before it moves."
3. ⚡ Line movement alerts — "Sharp money moves lines fast. Get notified the moment it happens."
4. 🏥 Injury reports — "Never bet blind. Real-time injury status for every player across all major sports."
5. 📈 CLV tracking — "Prove you have a real edge. See how your bets close versus the opening line."
6. 🏆 Team & player stats — "Everything you need to research and bet without switching tabs."

### Stats banner
Replace the current stats bar with a full width banner showing:
- "2,400+ bettors on the waitlist" 
- "5 books tracked simultaneously"
- "Updated every 60 seconds"
- "Avg edge found per game: +2.3 pts ⚠️" (flag this as placeholder for owner to verify)
Make the numbers large and bold, labels small and muted underneath. Full width, high contrast.

### Pricing section
- Add above the pricing cards: "Still on the fence? One better line pays for a year of Pro."
- Change the Free tier description to: "Everything a sharp bettor needs. No credit card ever."
- Change the Pro tier description to: "Let Capy do the thinking. Best bets served up daily — just bet and win."
- Make the Pro card have a glowing green border to make it visually dominant
- The founding member urgency badge needs to feel real — change "47 spots remaining" to a dynamic countdown that decreases by 1 every 24 hours starting from today. Store the count in localStorage so it persists. Start at 47, decrease by 1 each day, stop at 1 (never go to 0).
- Add under the founding member badge: "Price locks in forever when you claim. Goes to $19/mo after."

### Bottom CTA section
Change "Join the herd" section copy to:
- Headline: "Every bet you place without Capy is a bet you could have made better."
- Subtext: "Free to start. No credit card. Takes 30 seconds."
- CTA button: "Find my edge now →"

---

## Part 2: Capy's Picks urgency (odds.html)

### Section header
Change "We scanned 5 books and found these edges. Updated every 60 seconds." to:
"These edges won't last. Lines move fast — act before the window closes."

### Locked Pro card copy
Change the unlock banner from "Unlock all picks + full Capy's Picks with Pro — $7/mo" to:
"🔒 You're missing 2 of today's best edges. Unlock with Pro — $7/mo → One better line pays for a year."

### Free card label
Add a small line under the first (visible) Capy's Pick card:
"⚡ This edge is live now — lines move fast"

### Edge expiry note
Add a subtle line at the very top of the odds page under the stats bar:
"⏱ Today's edges expire at game time. Check back tomorrow for new opportunities."

---

## Part 3: General urgency signals

### Navbar
Add a subtle amber/yellow pill in the navbar on all pages: "⚡ Founding rate — $7/mo" that links to /#pricing
This should be small and not overwhelming but always visible as a persistent reminder

### Page title tags
Update the browser tab titles:
- Homepage: "Capy — Stop Losing Money on Bad Lines"
- Odds page: "Today's Best Betting Edges | Capy"
- Stats page: "Team Stats & Injury Reports | Capy"

---

## Important notes for owner
- The "$340/year" and "+2.3 pts avg edge" figures are estimates based on industry data — verify or adjust before heavily promoting
- The founding member countdown is cosmetic/localStorage only — update your actual Stripe/signup system separately when spots fill
- All copy changes should maintain the Capy brand voice: confident, slightly sharp, data-driven — not fear-mongering or aggressive

---

## Deliverable
- /backup-v17/ with all current files
- Updated index.html, odds.html
- Summary of every change made
- Flag all placeholder stats clearly
- Commit and push when done
