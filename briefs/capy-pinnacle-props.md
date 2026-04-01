# GetCapy — Pinnacle Sharp Line EV + Player Props in Parlay Builder

## Before anything
Back up all current files into /backup-v25/ before touching anything.

---

## Overview
Two major upgrades in one:
1. Use Pinnacle as the sharp line reference for accurate EV calculations across the site
2. Add player props to the parlay builder and game breakdown pages

---

## Part 1: Pinnacle Sharp Line Integration

### Update api/odds.js
Make a second parallel API call to fetch Pinnacle lines alongside the existing US books call:

```javascript
// Existing call - US books
const usUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;

// New call - Pinnacle only for sharp line reference
const pinnacleUrl = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=eu&bookmakers=pinnacle&markets=h2h&oddsFormat=american&dateFormat=iso`;
```

- Fetch both in parallel using Promise.all
- Match Pinnacle games to US book games by home_team + away_team
- Return both datasets in the API response: { usOdds: [...], pinnacleOdds: [...] }
- If Pinnacle has no data for a game, fall back to the current DraftKings/FanDuel reference method
- Add error handling so if the Pinnacle call fails the main odds still load normally

### Update EV calculation in odds.html
Replace the current reference book method with Pinnacle:

1. For each game find the matching Pinnacle moneyline
2. Use Pinnacle's home and away moneyline as the two inputs for no-vig fair odds calculation
3. Calculate fair probabilities from Pinnacle lines only
4. Compare best available US book line against Pinnacle fair odds for EV
5. Log to console: "Using Pinnacle as sharp reference" when available, "Using DraftKings fallback" when not
6. This should produce much more accurate EV — some bets will now show genuinely +EV vs Pinnacle

### Display update
- Add a small "📍 vs Pinnacle" label next to EV % when Pinnacle data is available
- Add "📍 vs Market" when using fallback
- This tells sharp bettors exactly what the EV is measured against

---

## Part 2: Player Props API

### Create new api/props.js
```javascript
export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  const sport = req.query.sport || 'basketball_nba';
  const eventId = req.query.eventId;
  
  if (!eventId) return res.status(400).json({ error: 'missing eventId' });

  // Fetch player props for specific game
  const markets = sport === 'basketball_nba' 
    ? 'player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals'
    : sport === 'americanfootball_nfl'
    ? 'player_pass_tds,player_pass_yards,player_rush_yards,player_reception_yards,player_receptions'
    : sport === 'baseball_mlb'
    ? 'player_hits,player_home_runs,player_rbis,player_strikeouts_thrown'
    : sport === 'icehockey_nhl'
    ? 'player_points,player_goals,player_assists'
    : 'player_points';

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&markets=${markets}&oddsFormat=american&dateFormat=iso`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data?.message || 'API error' });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch props' });
  }
}
```

### Props data structure
Each prop should be shaped as:
```javascript
{
  player: "LeBron James",
  market: "Points",
  line: 24.5,
  overOdds: -115,  // best available over odds across books
  underOdds: -105, // best available under odds across books
  overBook: "FanDuel",
  underBook: "DraftKings",
  ev: "+1.2%",     // EV vs Pinnacle or market if available
  evSide: "over"   // which side has better EV
}
```

---

## Part 3: Player Props on Game Breakdown Page (game.html)

### Props section
Add a "Player Props" section to each game breakdown page below the team stats:

- Section header: "🎯 Player Props — Best Available Lines"
- Load props automatically when a game breakdown page opens
- Show a loading skeleton while fetching
- Display props in a clean table with columns: Player | Prop | Line | Best Over | Best Under | EV | Add to Parlay

### Props table design
- Group by prop type: Points, Rebounds, Assists etc. with collapsible headers
- Best available over odds highlighted green, best available under highlighted green (both can be green since they're different sides)
- Show which book has the best line for each side
- EV indicator: show EV % if calculable vs Pinnacle, otherwise show "—"
- Sort by EV within each group — highest EV props at top

### Add to Parlay button
- Each prop row has a small "➕" button on the right
- Clicking adds that prop leg to the parlay builder with the best available line pre-selected
- Toast notification: "Added [Player] [Prop] to parlay → View parlay"
- Over/Under toggle on each row so user can pick which side before adding

### If no props available
Show: "Props not available for this game yet — check back closer to tip-off"

---

## Part 4: Player Props in Parlay Builder (parlay.html)

### Props search/browse tab
Add a second tab to the game selector on the left column:
- Tab 1: "Games" (existing game cards)
- Tab 2: "Player Props"

### Props tab layout
- Sport filter at top (NBA, NFL, MLB, NHL)
- Search bar: "Search player name..."
- Below: list of all available props for today's games grouped by game
- Each prop shows: player name, prop type, line, best over odds, best under odds, EV %
- Over/Under toggle to select which side
- "➕ Add" button

### Props in parlay summary
When a prop is added to the parlay show:
- Player emoji (🏀 for NBA, 🏈 for NFL etc.) + player name
- Prop type and line (e.g. "LeBron James — Over 24.5 Points")
- Best available odds and which book
- EV % if available
- Remove button

### Capy's Suggested Parlay — include props
Update Capy's suggested parlay to optionally mix game picks AND player props:
- If any props have EV > +2% include the best one as a leg in Capy's suggested parlay
- Label it clearly: "🎯 Prop pick"
- Max 1 prop leg in Capy's suggested parlay — keep it simple

---

## Part 5: Props on /odds page game cards

### Props preview on each game card
- In list view: add a "Props" pill/button below the odds table that expands to show top 3 props for that game by EV
- In grid view: add a small "🎯 X props" badge on each card that links to the game breakdown page
- Top 3 props should show: player name, prop type, line, best EV side

---

## Sport coverage
Props should work for these sports in priority order:
1. NBA (basketball_nba) — points, rebounds, assists, threes, blocks, steals
2. NFL (americanfootball_nfl) — passing yards, rush yards, receiving yards, TDs, receptions
3. MLB (baseball_mlb) — hits, home runs, RBIs, strikeouts
4. NHL (icehockey_nhl) — points, goals, assists

For other sports show: "Props coming soon for this sport"

---

## Performance notes
- Props API calls should be lazy loaded — only fetch when user clicks into a game or the Props tab
- Cache props data for 5 minutes to avoid hammering the API
- Show skeleton loaders while props are fetching
- Props use more API credits than regular odds — add a console log showing remaining credits after each props fetch so the owner can monitor usage

---

## Important notes for owner
- Player props use more API credits per call than regular odds — monitor your usage at the-odds-api.com dashboard
- Pinnacle EU region fetch uses additional credits per call — both are worth it for accuracy
- Props availability varies by sport and book — some games will have limited props especially early in the day
- Test thoroughly with tonight's NBA games first before checking other sports

---

## Deliverable
- /backup-v25/ with all current files
- New api/props.js
- Updated api/odds.js (Pinnacle integration)
- Updated odds.html (props preview on cards)
- Updated game.html (props section)
- Updated parlay.html (props tab and Capy suggested parlay)
- Summary of all changes
- Flag any issues found during implementation
- Commit and push when done
