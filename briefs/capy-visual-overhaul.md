# GetCapy — Premium Visual Overhaul (/odds page)

## Before anything
Back up all current files into /backup-v36/ before touching anything.

---

## Goal
Transform the /odds page from feeling like a basic website into a premium, professional tool that serious bettors trust immediately. The aesthetic direction is: **data terminal meets premium sports analytics** — think Bloomberg terminal energy but with the Capy brand warmth. Sharp, confident, every pixel intentional.

This is a visual polish pass only — do not change any functionality, API calls, or data logic. Only touch CSS and visual presentation.

---

## Design Direction

### Typography
- Import and use **DM Mono** (Google Fonts) for all odds numbers, edge scores, EV percentages, and data values — monospace makes numbers align perfectly and feels premium/terminal-like
- Import and use **Outfit** (Google Fonts) for all UI labels, headings, team names, and body text — clean, modern, slightly geometric
- Never use system fonts for anything visible to the user
- Font scale — enforce this exactly across the whole page:
  - Page title / section headers: 20px, weight 600, Outfit
  - Team names: 16px, weight 600, Outfit
  - Odds numbers: 15px, weight 500, DM Mono
  - Labels / book names: 11px, weight 500, uppercase, letter-spacing 0.08em, Outfit
  - Edge/EV badges: 13px, weight 600, DM Mono
  - Secondary text / timestamps: 12px, weight 400, Outfit, muted color
  - Body/description text: 14px, weight 400, Outfit

### Color System — Light Mode
Replace flat colors with a refined palette:
- Page background: #F7F8FA (very slight cool grey, not pure white)
- Card background: #FFFFFF
- Card border: 1px solid #E8EBF0
- Card shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)
- Primary text: #0F1117
- Secondary text: #6B7280
- Muted text: #9CA3AF
- Best line green: #16A34A background, #FFFFFF text (solid, confident)
- Best line green cell: #F0FDF4 background, #15803D text (for table cells)
- Worst line: #FEF2F2 background, #DC2626 text (for table cells)
- Neutral cell: #FFFFFF background
- Edge badge positive: #DCFCE7 background, #15803D text
- Edge badge neutral: #F3F4F6 background, #6B7280 text
- Accent / interactive: #2563EB (blue, used for links and hover states)
- Capy brand green: #16A34A (used for CTAs and highlights)
- Border radius on cards: 12px
- Border radius on badges: 6px
- Border radius on buttons: 8px

### Color System — Dark Mode
- Page background: #0A0C10
- Card background: #111318
- Card border: 1px solid #1F2330
- Card shadow: 0 1px 3px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)
- Primary text: #F1F5F9
- Secondary text: #94A3B8
- Muted text: #64748B
- Best line green cell: #052E16 background, #4ADE80 text
- Worst line cell: #2D0A0A background, #F87171 text
- Neutral cell: #111318 background
- Edge badge positive: #052E16 background, #4ADE80 text
- Edge badge neutral: #1E2330 background, #64748B text
- Accent: #3B82F6
- Capy brand green: #22C55E

---

## Specific Component Upgrades

### 1. Page header / stats bar
- The four stats (Games today, Books tracked, Best edge, Last updated) should be displayed as a sleek horizontal bar
- Each stat: large number in DM Mono at 24px weight 600, label below in 11px uppercase Outfit muted
- Subtle dividers between stats
- Bar has card styling (white background, border, shadow) in light mode
- Full width, no dead space

### 2. Filter / sport tabs sidebar
- Sport category headers: 11px uppercase letter-spaced, muted color, Outfit
- Individual sport pills: compact, 13px Outfit, rounded, subtle hover state
- Active sport: solid green background, white text
- Inactive: transparent, secondary text color, hover shows light grey background
- Smooth transition on hover (0.15s)
- Collapsible categories should have a subtle chevron that rotates on open/close

### 3. Capy's Picks cards
- These should be the most visually premium element on the page
- Card: white background, 12px border radius, subtle shadow, 1px border
- Top section: sport emoji + team names in 16px semibold, game time in muted 12px below
- Middle: confidence badge (🔥 Strong Pick etc.) prominently placed, large EV number in DM Mono
- The "vs Pinnacle" label should be a small pill badge: #EFF6FF background, #2563EB text
- Best book highlighted with a subtle green pill
- "Bet at [Book] →" button: solid green (#16A34A), white text, 8px border radius, 12px padding, Outfit 14px semibold
- Locked Pro cards: same card structure but content blurred (backdrop-filter: blur(4px)), with a clean lock overlay
- Cards should have a subtle lift on hover: transform translateY(-2px), shadow increases

### 4. Game cards (list view)
- Clean card container: white, 12px radius, border, shadow
- Header row: sport emoji + team names left, game time + edge badge right
- Edge badge: pill shape, DM Mono, color coded
- "🔥 Top Edge" badge: animated subtle pulse on the glow, green
- Odds table inside card:
  - Book name headers: 11px uppercase letter-spaced muted — spell out full names
  - Bet type row labels: 13px Outfit, left aligned
  - Odds numbers: 15px DM Mono, right aligned, all same weight
  - Best line cell: #F0FDF4 background with left border accent 3px solid #16A34A
  - Worst line cell: #FEF2F2 background
  - "All books equal" row: italic, muted, centered
  - Row hover: very subtle #F9FAFB background highlight
  - Alternating rows: barely perceptible — #FAFAFA vs #FFFFFF
- "Bet →" link: small, DM Mono, green, underline on hover
- "Show odds ▼" expand button: full width bottom, 12px Outfit, muted, chevron rotates on expand
- Card hover: translateY(-1px), shadow deepens slightly

### 5. Game cards (grid view)
- 2 column default on desktop, each card fills its column completely
- Same card styling as list view
- Compact odds table showing only ML and spread
- "Expand →" button pinned to bottom of card
- Cards in same row must be equal height — use CSS grid with align-items: stretch

### 6. Methodology banner
- Remove the full-width flat banner
- Replace with a compact pill/badge at the top of the game list:
  "📍 EV calculated vs Pinnacle sharp line · 🟢 Best line · 🔴 Worst line · ⚪ All books equal"
- Style: #F8FAFC background, #64748B text, 1px border #E2E8F0, 8px border radius, 12px padding, 13px Outfit

### 7. View toggle (List / 2 Grid / 4 Grid)
- Clean segmented control — not separate buttons
- Pill container with sliding active indicator
- Icons for each view type
- Smooth transition when switching views

### 8. Sort buttons
- Same segmented control style as view toggle
- "Sort: Best Edge" and "Sort: Time" as clean pills

### 9. Affiliate bar at bottom
- Clean horizontal bar, card styled
- Book logos/names as subtle pills
- "Ready to bet?" in semibold, then the book links
- Not intrusive but clearly visible

---

## Animation & Motion

- Page load: stats bar fades in first, then Capy's Picks section, then game cards stagger in with 50ms delay between each (animation: fadeInUp 0.3s ease both)
- Card hover: 0.15s ease transform and shadow
- Badge pulse: Capy's Top Edge badge should have a very subtle scale pulse (scale 1.0 to 1.03) on a 2s loop
- Expand/collapse: smooth max-height transition 0.25s ease
- Dark/light mode toggle: 0.2s transition on all color properties
- No jarring or distracting animations — everything should feel smooth and intentional

---

## Things to NOT change
- Any JavaScript logic
- API calls or data fetching
- The structure of HTML elements (only add classes, don't restructure)
- Functionality of any buttons or toggles
- Mobile collapse behavior

---

## Final check
After implementing, verify:
- Odds numbers are all the same size and weight in both highlighted and normal cells
- Dark mode looks as polished as light mode — test every component
- No horizontal scroll on desktop or mobile
- Cards in grid view are equal height in each row
- All fonts loaded correctly from Google Fonts

---

## Deliverable
- /backup-v36/ with all current files
- Updated odds.html (CSS only changes)
- Summary of visual changes made
- Commit and push when done
