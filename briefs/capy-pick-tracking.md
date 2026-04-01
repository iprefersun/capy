# GetCapy — Pick Tracking System

## Before anything
Back up all current files into /backup-v29/ before touching anything.

---

## Overview
Build an automated pick tracking system that:
1. Automatically saves Capy's Picks to Supabase every time they update
2. Checks scores after games end and records win/loss/push automatically
3. Has a private admin page to view and manage all tracked picks
4. Has a public results page showing Capy's transparent track record

---

## Environment Variables (already set in Vercel)
- SUPABASE_URL
- SUPABASE_ANON_KEY

---

## Part 1: Supabase Security (RLS)

Run these SQL commands in Supabase SQL editor to enable Row Level Security:

```sql
-- Enable RLS on both tables
alter table picks enable row level security;
alter table results enable row level security;

-- Allow public read access to picks and results (for the public record page)
create policy "Public can read picks" on picks
  for select using (true);

create policy "Public can read results" on results
  for select using (true);

-- Only allow inserts/updates from the service role (server side only)
create policy "Service role can insert picks" on picks
  for insert with check (true);

create policy "Service role can update picks" on picks
  for update using (true);

create policy "Service role can insert results" on results
  for insert with check (true);

create policy "Service role can update results" on results
  for update using (true);
```

Note for owner: Add SUPABASE_SERVICE_KEY as a Vercel environment variable for the admin/write operations. Find it in Supabase → Settings → API → service_role key. Never expose this in frontend code.

---

## Part 2: New API Endpoints

### api/save-picks.js
Automatically saves Capy's top 3 picks to Supabase whenever they are generated:

```javascript
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { picks } = req.body;
  if (!picks || !Array.isArray(picks)) return res.status(400).json({ error: 'Invalid picks data' });

  // Only save picks we haven't saved today (check by game_id)
  const gameIds = picks.map(p => p.game_id);
  const { data: existing } = await supabase
    .from('picks')
    .select('game_id')
    .in('game_id', gameIds)
    .gte('created_at', new Date().toISOString().split('T')[0]);

  const existingIds = (existing || []).map(e => e.game_id);
  const newPicks = picks.filter(p => !existingIds.includes(p.game_id));

  if (newPicks.length === 0) return res.status(200).json({ message: 'No new picks to save' });

  const { data, error } = await supabase.from('picks').insert(newPicks);
  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ saved: newPicks.length, data });
}
```

### api/check-results.js
Checks scores for completed games and updates results in Supabase:

```javascript
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Get all pending picks from the last 7 days
  const { data: pendingPicks } = await supabase
    .from('picks')
    .select('*, results(*)')
    .gte('game_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .lte('game_time', new Date().toISOString());

  if (!pendingPicks || pendingPicks.length === 0) {
    return res.status(200).json({ message: 'No pending picks to check' });
  }

  // Filter to picks that don't have a result yet or are still pending
  const unresolved = pendingPicks.filter(p => 
    !p.results?.length || p.results[0]?.outcome === 'pending'
  );

  const API_KEY = process.env.ODDS_API_KEY;
  let resolved = 0;

  for (const pick of unresolved) {
    try {
      // Fetch scores from The Odds API
      const scoreRes = await fetch(
        `https://api.the-odds-api.com/v4/sports/${pick.sport}/scores/?apiKey=${API_KEY}&daysFrom=3&dateFormat=iso`
      );
      const scores = await scoreRes.json();
      
      const game = scores.find(s => s.id === pick.game_id);
      if (!game || !game.completed) continue;

      // Determine outcome based on pick type
      let outcome = 'pending';
      const homeScore = game.scores?.find(s => s.name === game.home_team)?.score;
      const awayScore = game.scores?.find(s => s.name === game.away_team)?.score;

      if (homeScore !== undefined && awayScore !== undefined) {
        const homeWon = parseInt(homeScore) > parseInt(awayScore);
        const awayWon = parseInt(awayScore) > parseInt(homeScore);

        if (pick.pick_type === 'ml') {
          const pickedHome = pick.pick.includes(game.home_team);
          if (pickedHome) outcome = homeWon ? 'win' : 'loss';
          else outcome = awayWon ? 'win' : 'loss';
        } else if (pick.pick_type === 'spread') {
          const margin = parseInt(homeScore) - parseInt(awayScore);
          const pickedHome = pick.pick.includes(game.home_team);
          if (pickedHome) {
            const adjustedMargin = margin + pick.line;
            outcome = adjustedMargin > 0 ? 'win' : adjustedMargin === 0 ? 'push' : 'loss';
          } else {
            const adjustedMargin = margin - pick.line;
            outcome = adjustedMargin < 0 ? 'win' : adjustedMargin === 0 ? 'push' : 'loss';
          }
        }

        if (outcome !== 'pending') {
          // Get closing line for CLV calculation
          const closingLine = pick.odds; // placeholder — update when closing line data available

          await supabase.from('results').upsert({
            pick_id: pick.id,
            outcome,
            score_home: parseInt(homeScore),
            score_away: parseInt(awayScore),
            closing_line: closingLine,
            recorded_at: new Date().toISOString()
          }, { onConflict: 'pick_id' });

          resolved++;
        }
      }
    } catch (err) {
      console.error(`Error checking result for pick ${pick.id}:`, err.message);
    }
  }

  res.status(200).json({ checked: unresolved.length, resolved });
}
```

### api/get-record.js
Returns Capy's public track record stats:

```javascript
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  const { data: results } = await supabase
    .from('results')
    .select('*, picks(*)')
    .neq('outcome', 'pending')
    .order('recorded_at', { ascending: false });

  if (!results) return res.status(200).json({ picks: [], stats: {} });

  const wins = results.filter(r => r.outcome === 'win').length;
  const losses = results.filter(r => r.outcome === 'loss').length;
  const pushes = results.filter(r => r.outcome === 'push').length;
  const total = wins + losses + pushes;
  const winRate = total > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;

  // ROI calculation (assuming $100 flat bet)
  let roi = 0;
  results.forEach(r => {
    if (r.outcome === 'win') {
      const odds = r.picks?.odds || 0;
      const profit = odds > 0 ? odds : (10000 / Math.abs(odds));
      roi += profit;
    } else if (r.outcome === 'loss') {
      roi -= 100;
    }
  });

  const stats = {
    total,
    wins,
    losses,
    pushes,
    winRate,
    roi: roi.toFixed(0),
    roiPercent: total > 0 ? ((roi / (total * 100)) * 100).toFixed(1) : 0
  };

  res.status(200).json({ picks: results.slice(0, 50), stats });
}
```

---

## Part 3: Auto-save picks from odds.html

In odds.html update the Capy's Picks rendering function to automatically POST picks to /api/save-picks after they are displayed:

```javascript
async function saveCappyPicksToSupabase(picks) {
  try {
    const payload = picks.map(pick => ({
      game_id: pick.id,
      sport: pick.sport,
      home_team: pick.home_team,
      away_team: pick.away_team,
      pick: pick.recommendedPick,
      pick_type: pick.pickType, // 'ml' or 'spread'
      line: pick.line,
      odds: pick.bestOdds,
      book: pick.bestBook,
      ev_percent: pick.ev,
      edge: pick.edge,
      game_time: pick.commence_time
    }));

    await fetch('/api/save-picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ picks: payload })
    });
  } catch (err) {
    console.log('[Capy] Could not save picks to database:', err.message);
  }
}
```

Call this function after Capy's Picks are rendered. Fail silently — if saving fails the UI should not be affected.

---

## Part 4: Vercel Cron Job for Auto-checking Results

Create vercel.json cron configuration to automatically check results twice daily:

```json
{
  "crons": [
    {
      "path": "/api/check-results",
      "schedule": "0 6,23 * * *"
    }
  ]
}
```

This runs check-results at 6am and 11pm every day automatically.

Note: If vercel.json already exists, add the crons key to it without replacing existing config.

---

## Part 5: Admin Page (/admin.html)

Create a simple password-protected admin page:

### Authentication
- Simple password prompt on page load
- Password stored as environment variable ADMIN_PASSWORD in Vercel
- If wrong password: show "Access denied" and clear the page
- Store auth in sessionStorage so they don't have to re-enter on refresh
- This is basic security — sufficient for now

### Layout
- Same navbar as rest of site
- Page title: "🦫 Capy Admin — Pick Tracker"
- Three tabs: "Pending Picks" | "Completed" | "Stats"

### Pending Picks tab
- Shows all picks where result is still pending
- Each row: Date, Sport, Game, Pick, Odds, EV%, Book, Game Time
- Manual override button per row: mark as Win / Loss / Push if auto-detection fails
- Delete button to remove a pick

### Completed tab
- Shows all resolved picks with outcomes
- Color coded: green for wins, red for losses, grey for pushes
- Shows CLV if available
- Sortable by date, sport, outcome

### Stats tab
- Win rate, ROI, total picks
- Breakdown by sport
- Breakdown by pick type (ML vs spread)
- Best and worst performing books
- Average EV at time of pick for wins vs losses

---

## Part 6: Public Results Page (/record.html)

Create a public-facing track record page:

### Hero section
- "📊 Capy's Track Record"
- Subtext: "Full transparency. Every pick logged. Every result verified."
- Four stat cards: Total Picks | Win Rate | ROI | Avg EV at Pick Time
- If less than 20 picks: show "Building our record — check back soon. Every pick is being tracked from day one."

### Picks table
- Shows last 50 resolved picks
- Columns: Date | Sport | Pick | Odds | EV at Pick | Result | CLV
- Color coded outcomes
- Sortable columns
- Filter by sport, outcome, date range

### Credibility section
- "How we track" explanation:
  "Every pick Capy flags is automatically saved to our database with the exact odds at time of pick. Results are verified against official scores. We never delete losing picks. This record started [date] and every bet is shown."
- Link to Supabase data (optional — shows we're not hiding anything)

### Empty state (before picks accumulate)
- Show a preview of what the record will look like with placeholder rows
- "Picks are being tracked starting today. Come back tomorrow to see results."

### Nav link
- Add "Record" to navbar on all pages linking to /record.html

---

## Deliverable
- /backup-v29/ with all current files
- New files: api/save-picks.js, api/check-results.js, api/get-record.js, admin.html, record.html
- Updated: odds.html (auto-save picks), vercel.json (cron job)
- SQL commands for RLS (provided above — owner needs to run these in Supabase SQL editor)
- Summary of all changes
- Note: Owner needs to add SUPABASE_SERVICE_KEY and ADMIN_PASSWORD to Vercel environment variables
- Commit and push when done
