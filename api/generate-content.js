// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   GROQ_API_KEY
//   RESEND_API_KEY
//   OWNER_EMAIL
//
// Supabase tables used:
//   picks             — pick, home_team, away_team, sport, odds, book, ev_percent, pick_type, created_at
//   results           — pick_id, outcome, recorded_at (FK → picks.id)
//   generated_content — id, created_at, content_json (jsonb), picks_summary (text)

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  try {
    // ── 0. Read optional params ────────────────────────────────────────────────
    const body = req.method === 'POST' ? (req.body || {}) : {};
    const customPromptHint = req.query.customPromptHint || body.customPromptHint || null;
    const followUp = req.query.followUp === 'true' || body.followUp === true;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // ── 1. Fetch today's picks ─────────────────────────────────────────────────
    const { data: picks, error: dbError } = await supabase
      .from('picks')
      .select('*')
      .gte('created_at', today)
      .order('ev_percent', { ascending: false })
      .limit(5);

    if (dbError) throw new Error(`Supabase picks error: ${dbError.message}`);
    if (!picks || picks.length === 0) {
      return res.status(200).json({ message: 'No picks found for today' });
    }

    // ── 2. Fetch yesterday's resolved results for context ─────────────────────
    // Finds picks from yesterday that have been resolved — used for email header
    // and to give the content a "here's what happened" narrative thread.
    let yesterdayResults = [];
    try {
      const { data: resultRows } = await supabase
        .from('results')
        .select('outcome, recorded_at, picks(pick, odds, home_team, away_team, sport)')
        .gte('recorded_at', yesterday)
        .lt('recorded_at', today)
        .neq('outcome', 'pending')
        .order('recorded_at', { ascending: false })
        .limit(5);
      yesterdayResults = resultRows || [];
    } catch (err) {
      console.warn('[generate-content] Could not fetch yesterday results:', err.message);
    }

    // ── 3. Sanitize EV — Supabase sometimes stores 315.7 instead of 3.157 ─────
    const sanitizedPicks = picks.map(p => ({
      ...p,
      ev_percent: p.ev_percent != null && Math.abs(p.ev_percent) > 100
        ? parseFloat((p.ev_percent / 100).toFixed(2))
        : p.ev_percent,
      pick_type: p.pick_type || 'sharp', // default older picks to sharp
    }));

    // ── 4. Categorize picks by EV threshold ──────────────────────────────────
    // Only picks with EV >= 1% are presented as value plays in content.
    // Longshots are included but clearly labeled as high-variance.
    // Picks with no EV or EV < 1% are never promoted — labeled explicitly if mentioned.
    const sharpPicks    = sanitizedPicks.filter(p => p.pick_type === 'sharp' && p.ev_percent != null && p.ev_percent >= 1);
    const longshotPicks = sanitizedPicks.filter(p => p.pick_type === 'longshot' && p.ev_percent != null && p.ev_percent >= 1);
    const noEvPicks     = sanitizedPicks.filter(p => p.ev_percent == null || p.ev_percent < 1);
    const hasValidPicks = sharpPicks.length + longshotPicks.length >= 1;

    const todayDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // ── 5. Format pick data for the prompt ────────────────────────────────────
    // Returns null for picks missing required fields — callers must filter(Boolean).
    const fmtPick = (p, label) => {
      if (!p.pick || typeof p.pick !== 'string' || !p.pick.trim() ||
          !p.away_team || typeof p.away_team !== 'string' || !p.away_team.trim() ||
          !p.home_team || typeof p.home_team !== 'string' || !p.home_team.trim()) {
        console.warn('[generate-content] Skipping pick with missing required fields:', {
          pick: p.pick, away_team: p.away_team, home_team: p.home_team, game_id: p.game_id,
        });
        return null;
      }
      const ev       = p.ev_percent != null ? `+${parseFloat(p.ev_percent).toFixed(1)}%` : 'EV unknown';
      const odds     = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
      const pinnacle = p.pinnacle_odds != null
        ? (p.pinnacle_odds > 0 ? `+${p.pinnacle_odds}` : `${p.pinnacle_odds}`)
        : '?';
      return `  ${label} ${p.pick} ${odds} @ ${p.book} | Pinnacle: ${pinnacle} | Gap: ${ev} EV | Game: ${p.away_team} @ ${p.home_team} [${p.sport || '?'}]`;
    };

    const sharpText = sharpPicks.length
      ? `SHARP PICKS (EV ≥1%, odds -200 to +300):\n${sharpPicks.map(p => fmtPick(p, '•')).filter(Boolean).join('\n')}\n\n`
      : '';

    const longshotText = longshotPicks.length
      ? `LONG SHOT PLAYS (EV ≥1%, odds +300 to +1500 — high variance, expected hit rate ~15-25%):\n${longshotPicks.map(p => fmtPick(p, '⚡')).filter(Boolean).join('\n')}\n\n`
      : '';

    const noEvText = noEvPicks.length
      ? `PICKS WITH NO POSITIVE EV (must NOT be promoted as value plays if mentioned at all):\n${noEvPicks.map(p => {
          const odds = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
          return `  — ${p.pick} ${odds} (${p.book}) [not a +EV play]`;
        }).join('\n')}\n\n`
      : '';

    // ── 6. Yesterday's results context ────────────────────────────────────────
    let resultsContextForPrompt = '';
    if (yesterdayResults.length) {
      const wins   = yesterdayResults.filter(r => r.outcome === 'win').length;
      const losses = yesterdayResults.filter(r => r.outcome === 'loss').length;
      const pushes = yesterdayResults.filter(r => r.outcome === 'push').length;
      const record = `${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`;
      const lines = yesterdayResults.map(r => {
        const p = r.picks || {};
        const odds = p.odds != null ? (p.odds > 0 ? `+${p.odds}` : `${p.odds}`) : '?';
        const outcome = r.outcome === 'win' ? 'WIN' : r.outcome === 'loss' ? 'LOSS' : 'PUSH';
        return `  ${p.pick || '?'} ${odds} — ${outcome}`;
      });
      resultsContextForPrompt = `YESTERDAY'S RESOLVED RESULTS (${record} record):\n${lines.join('\n')}\n\nFRAMING INSTRUCTION FOR LOSSES: Never use phrases like "didn't go our way", "tough day", or "unlucky". If any losses occurred, frame it as: "${record} yesterday — this is what +EV betting looks like short term. Variance is real. The edge plays out over hundreds of bets, not daily."\n\n`;
    }

    // ── 7. Follow-up context from previous generated content ──────────────────
    let followUpContext = '';
    if (followUp) {
      try {
        const { data: prevRows } = await supabase
          .from('generated_content')
          .select('content_json, picks_summary, created_at')
          .order('created_at', { ascending: false })
          .limit(1);

        if (prevRows?.length > 0) {
          const prev = prevRows[0];
          const prevDate = new Date(prev.created_at).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric'
          });
          followUpContext = `\n\nFOLLOW-UP CONTEXT:\nPrevious date: ${prevDate}\nPrevious picks summary: ${prev.picks_summary || '(none)'}\nPrevious tweet: ${prev.content_json?.twitter?.[0] || '(none)'}\nInstruction: Reference the previous analysis honestly. If results are known, state them plainly. Connect to today's data — do not hype.`;
        } else {
          console.log('[generate-content] followUp=true but no previous content — using default');
        }
      } catch (err) {
        console.warn('[generate-content] Could not fetch previous content:', err.message);
      }
    }

    const hintLine = customPromptHint
      ? `\n\nOPERATOR INSTRUCTION: ${customPromptHint}`
      : '';

    // ── 8. Build Groq prompt ───────────────────────────────────────────────────
    // When there are no qualifying picks, fall back to methodology content.
    // This is intentional — we never force bad picks into content.
    const methodologyFallbackInstruction = !hasValidPicks
      ? `\n\nNO QUALIFYING PICKS TODAY: There are no picks with EV ≥1% today. Generate content about the Capy methodology instead — how Pinnacle de-vig works, why most lines are efficient, and what "expected value" actually means in practice. Do not invent or mention specific picks. Be honest that the tool found no clear edges today — this builds credibility.`
      : '';

    const prompt = `You are the content voice for Capy (getcapy.co) — a tool that finds +EV bets by comparing sportsbook odds to Pinnacle's sharp line. Write as the builder, not as a brand. Sound like a sharp bettor sharing what they found.

CORE MESSAGE: Books move at different speeds. The gap between a US book and Pinnacle is where the edge lives.

ABSOLUTE RULES — never violate:
- NEVER USE: "hot picks", "lock", "guaranteed", "fire play", "best bet", "bet like a pro", "this tool helps", "this tool compares", "tool I use", "this tool", "market inefficiency"
- ALWAYS USE: real numbers, real book names, real Pinnacle prices — no placeholders like "Team A"
- If data is incomplete for a pick (missing team name, missing Pinnacle odds), skip that pick entirely
- Voice: direct, humble, credible — like a person sharing research, not a product selling itself

TODAY'S DATA (${todayDate}):
${sharpText}${longshotText}${noEvText}${resultsContextForPrompt}${followUpContext}${hintLine}${methodologyFallbackInstruction}

Generate a JSON object (raw JSON only — no markdown, no backticks, no explanation before or after) with this exact structure. Follow every format rule exactly:

{
  "twitter": [
    "Tweet 1 — MAIN PICK. Must open with one of these signature phrases: 'Books don't agree 👇' OR 'This is the gap 👇' OR 'Sharp bettors start with price, not picks'. Then use stacked line breaks — NEVER compress into one line. Format exactly:\\n\\nBooks don't agree 👇\\n[Team] +[odds] on [Book]\\nPinnacle is closer to [pinnacle odds]\\nThat gap = [EV]% edge\\nNot a lock — just a better number\\ngetcapy.co",
    "Tweet 2 — REPLY / DEEPER EXPLANATION. Explain the gap in plain language. Format exactly:\\n\\nBooks don't agree on this one\\n[Book]: +[odds]\\nPinnacle: ~[pinnacle odds]\\nThat difference is where the edge comes from\\nMost people never look for this",
    "Tweet 3 — LONG SHOT (if one qualifies with EV ≥1%). Must include the Pinnacle comparison explicitly. Format exactly:\\n\\n[Team] +[odds] ([Book])\\nPinnacle has this closer to [pinnacle odds]\\nSmall edge — but still a long shot\\nNot all +EV bets feel comfortable\\ngetcapy.co\\n\\nIf no longshot qualifies, write a third data-focused tweet about comparing books to Pinnacle — still use stacked lines, still include real numbers from today's data."
  ],
  "reddit": {
    "title": "Found a +[X]% edge comparing [Book] to Pinnacle today ([Team]) — title must follow this format exactly, written as the builder not a brand",
    "body": "Under 150 words. Write as the person who built this, not as a brand. Open with the specific edge: '[Book] has [Team] at +[odds] while Pinnacle is closer to +[pinnacle odds] — that gap is roughly [EV]% EV.' Then one sentence on what that means long term. If yesterday had results, state them plainly at the top using the approved framing (X-Y record, variance is real). End with a genuine question: 'Curious how often people actually compare to sharp books vs just betting what they see.' Never use 'Tool I use', 'this tool', or any product language."
  },
  "tiktok": {
    "hook": "Must make the viewer feel 'I've been doing this wrong'. Choose one: 'Sharp bettors don't start with picks — they start with price.' OR 'Most people bet the team. Sharp bettors bet the number.' OR 'Sportsbooks don't always agree. Here is what that looks like.'",
    "script": "Max 8 short lines. Show the actual numbers from today's top pick. Walk through the gap between the book price and Pinnacle. End with: 'That gap is the edge.' Never say 'this tool', 'this app', or 'this helps you'. Each line separated by \\n.",
    "caption": "Perspective-first — about the insight, not the product. Include: #sportsbetting #expectedvalue #sharpbetting #valuebets #pinnacle #getcapy"
  },
  "instagram": {
    "caption": "3-4 sentences. Lead with the insight. Show the math: book odds vs Pinnacle vs EV gap. Must include this exact sentence somewhere: 'That doesn\\'t guarantee a win — it just means you\\'re on the right side of the number long term.' Analytical tone — no exclamation marks on data statements.",
    "hashtags": "#sportsbetting #expectedvalue #sharpbetting #valuebets #pinnacle #getcapy"
  }
}`;

    // ── 9. Call Groq API (model and setup unchanged) ──────────────────────────
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are writing content for a sports betting analytics brand called Capy (getcapy.co). The product finds positive expected value (+EV) bets by comparing sportsbook odds to Pinnacle — the sharpest market in the world.

Your job is to turn structured betting data into human, sharp, trustworthy content across Twitter, Reddit, TikTok, and Instagram.

VOICE:
- Sound like a sharp bettor sharing what they found — not a tool explaining itself
- Be concise, clear, and direct
- Focus on WHY the bet is mispriced — the gap between the book price and Pinnacle
- Acknowledge uncertainty ("not a lock", "long term edge", "variance is real")
- Write like a real person, not a fintech product

DO:
- Always include the sportsbook price AND the Pinnacle price
- Emphasize the gap between them — that gap is the whole product
- Use plain language: "books don't agree", "price is off", "you're getting a better number"
- Lead with the best EV pick (most believable odds) as the main post
- Make secondary picks (long shots) feel secondary — replies or footnotes, not headlines

DO NOT use any of these phrases ever:
- "expected value indicates"
- "the tool found" / "the tool identifies"
- "market inefficiency" / "book inefficiency"
- "undervaluation" / "overvaluation"
- "data-driven approach"
- "more informed betting decisions"
- "indicates a potential"
- "hot picks", "lock", "guaranteed", "fire play", "best bet"
- Any placeholder like "Team A" or missing team names — if data is incomplete, skip the pick entirely

WHEN PICKS LOST YESTERDAY:
Do not say "didn't go our way". Instead say something like:
"X-Y yesterday — this is what +EV betting looks like short term. Variance is real. The edge plays out over hundreds of bets, not daily."

TWITTER FORMAT (main pick):
[Team] +[odds] on [Book]
Pinnacle is closer to [pinnacle odds]
That gap = [EV]% edge
Not a lock — just a better price than the sharp market
getcapy.co

TWITTER FORMAT (reply / deeper explanation):
Books don't agree on this one
[Book]: +[odds]
Pinnacle: ~[pinnacle odds]
That difference is where the edge comes from
Most people never look for this

OUTPUT STRUCTURE:
1. One main Twitter post (best EV pick, clearest edge)
2. One reply tweet (explains the gap deeper)
3. One secondary tweet if a long shot qualifies (frame as secondary, not headline)
4. One Reddit post (title + body — explain what the tool found and why it matters, written as a person not a product)
5. One TikTok script (hook that makes people feel "I've been doing this wrong", then show the numbers, explain the gap, end with the long term edge concept)
6. One Instagram caption (make it about the bettor, not the tool — "when you see this gap, here's what it means for you")

Keep everything tight. No fluff. No over-explanation. Sound like someone who knows what they're talking about.

CRITICAL — RESPONSE FORMAT: Return only a single valid JSON object. No markdown, no backticks, no explanation before or after. No newlines inside string values except where explicitly shown as \\n. This is machine-parsed — any extra text breaks the output.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const groqData = await groqRes.json();
    const rawContent = groqData.choices?.[0]?.message?.content;

    if (!groqRes.ok) {
      throw new Error(`Groq API error ${groqRes.status}: ${JSON.stringify(groqData)}`);
    }
    if (!rawContent) {
      throw new Error('Groq returned no content');
    }

    // ── 10. Parse JSON ─────────────────────────────────────────────────────────
    const cleaned = rawContent
      .replace(/```json|```/g, '')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .trim();
    let content;
    try {
      content = JSON.parse(cleaned);
    } catch (parseErr) {
      throw new Error(`Failed to parse Groq JSON: ${parseErr.message}\nRaw: ${rawContent.slice(0, 500)}`);
    }

    // ── 11. Save generated content for follow-up use ──────────────────────────
    const picksText = sanitizedPicks.map(p => {
      const ev = p.ev_percent != null ? `+${parseFloat(p.ev_percent).toFixed(1)}% EV` : 'no EV';
      const odds = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
      return `${p.pick} ${odds} at ${p.book} ${ev} [${p.pick_type}]`;
    }).join('; ');

    const { error: saveErr } = await supabase
      .from('generated_content')
      .insert({ content_json: content, picks_summary: picksText });
    if (saveErr) {
      console.warn('[generate-content] Could not save to generated_content:', saveErr.message);
    } else {
      console.log('[generate-content] Saved to generated_content');
    }

    // ── 12. Build email HTML ───────────────────────────────────────────────────
    const section = (emoji, title, color, html) => `
      <div style="margin-bottom:28px;border-radius:10px;border:1.5px solid ${color};overflow:hidden;">
        <div style="background:${color};padding:10px 18px;">
          <span style="font-size:16px;font-weight:700;color:#fff;">${emoji} ${title}</span>
        </div>
        <div style="padding:16px 18px;background:#fafafa;font-family:monospace;font-size:13px;line-height:1.7;color:#222;">
          ${html}
        </div>
      </div>`;

    // ── Yesterday's results block (PART 5) ────────────────────────────────────
    let resultsEmailBlock = '';
    if (yesterdayResults.length) {
      const resultRows = yesterdayResults.map(r => {
        const p = r.picks || {};
        const odds = p.odds != null ? (p.odds > 0 ? `+${p.odds}` : `${p.odds}`) : '—';
        const winColor  = '#1D9E75';
        const lossColor = '#D85A30';
        const pushColor = '#888';
        const outcomeColor = r.outcome === 'win' ? winColor : r.outcome === 'loss' ? lossColor : pushColor;
        const outcomeLabel = r.outcome === 'win' ? '✅ WIN' : r.outcome === 'loss' ? '❌ LOSS' : '➖ PUSH';
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.pick || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:12px;">${(p.away_team || '').split(' ').pop()} @ ${(p.home_team || '').split(' ').pop()}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;">${odds}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:700;color:${outcomeColor};">${outcomeLabel}</td>
        </tr>`;
      }).join('');

      resultsEmailBlock = `
      <div style="margin-bottom:28px;border-radius:10px;border:1.5px solid #e0e0e0;overflow:hidden;">
        <div style="background:#374151;padding:10px 18px;">
          <span style="font-size:16px;font-weight:700;color:#fff;">📋 Yesterday's Results</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f5f5f5;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Pick</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Game</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Odds</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Result</th>
          </tr></thead>
          <tbody>${resultRows}</tbody>
        </table>
      </div>`;
    }

    // ── Today's picks table (PART 4) ──────────────────────────────────────────
    // Always show actual EV — "Unverified" in red if null, never "—"
    // Type column shows Sharp or Long Shot
    const picksHtml = sanitizedPicks.map(p => {
      const rawEV = p.ev_percent;
      let evDisplay, evColor;
      if (rawEV == null) {
        evDisplay = 'Unverified';
        evColor = '#D85A30';
      } else {
        evDisplay = `${rawEV >= 0 ? '+' : ''}${parseFloat(rawEV).toFixed(1)}%`;
        evColor = rawEV >= 1 ? '#1D9E75' : rawEV > 0 ? '#888' : '#D85A30';
      }
      const odds = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
      const isLongshot = p.pick_type === 'longshot';
      const typeLabel = isLongshot ? 'Long Shot' : 'Sharp';
      const typeBg    = isLongshot ? '#FEF3C7' : '#D1FAE5';
      const typeColor = isLongshot ? '#92400E' : '#065F46';
      const isLowEV   = rawEV == null || rawEV < 1;

      return `<tr${isLowEV ? ' style="opacity:0.65;"' : ''}>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.pick}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:12px;">${p.away_team} @ ${p.home_team}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;color:#888;">${p.sport || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:${typeBg};color:${typeColor};">${typeLabel}</span></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;">${odds}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:700;color:${evColor};">${evDisplay}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:12px;">${p.book}</td>
      </tr>`;
    }).join('');

    // ── Platform content sections ──────────────────────────────────────────────
    const twitterHtml = (content.twitter || []).map((t, i) =>
      `<div style="margin-bottom:12px;padding:10px 12px;background:#e8f4fd;border-radius:6px;border-left:3px solid #1da1f2;">
        <strong>Tweet ${i + 1}</strong><br>${t.replace(/\\n/g, '<br>').replace(/\n/g, '<br>')}
      </div>`
    ).join('');

    const redditHtml = `
      <div style="margin-bottom:8px;"><strong>Title:</strong><br>${content.reddit?.title || ''}</div>
      <div style="white-space:pre-wrap;background:#fff;padding:10px;border-radius:6px;border:1px solid #ddd;">${content.reddit?.body || ''}</div>`;

    const tiktokHtml = `
      <div style="margin-bottom:8px;padding:8px 12px;background:#fff0f5;border-radius:6px;border-left:3px solid #ff0050;">
        <strong>Hook:</strong> ${content.tiktok?.hook || ''}
      </div>
      <div style="margin-bottom:8px;">
        <strong>Script:</strong><br>
        <div style="white-space:pre-wrap;background:#fff;padding:10px;border-radius:6px;border:1px solid #ddd;margin-top:4px;">${(content.tiktok?.script || '').replace(/\\n/g, '\n')}</div>
      </div>
      <div><strong>Caption:</strong> ${content.tiktok?.caption || ''}</div>`;

    const igHtml = `
      <div style="margin-bottom:8px;white-space:pre-wrap;background:#fff;padding:10px;border-radius:6px;border:1px solid #ddd;">${content.instagram?.caption || ''}</div>
      <div style="color:#888;font-size:12px;">${content.instagram?.hashtags || ''}</div>`;

    const modeBadge = followUp
      ? `<div style="margin-bottom:10px;display:inline-block;padding:4px 12px;background:#EFF6FF;color:#1D4ED8;border-radius:20px;font-size:11px;font-weight:700;">🔁 Follow-up mode</div>`
      : '';
    const hintBadge = customPromptHint
      ? `<div style="margin-bottom:10px;display:inline-block;padding:4px 12px;background:#FEF9C3;color:#A16207;border-radius:20px;font-size:11px;font-weight:700;">💡 Hint: ${customPromptHint}</div>`
      : '';
    const noEvBadge = !hasValidPicks
      ? `<div style="margin-bottom:10px;display:inline-block;padding:4px 12px;background:#FEF2F2;color:#991B1B;border-radius:20px;font-size:11px;font-weight:700;">⚠️ No +EV picks today — methodology content generated</div>`
      : '';

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Inter',Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#222;background:#fff;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-size:32px;">🦫</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:900;margin:8px 0 4px;">Capy Daily Content</h1>
    <div style="font-size:13px;color:#888;">${todayDate}</div>
    <div style="margin-top:8px;">${modeBadge}${hintBadge}${noEvBadge}</div>
  </div>

  ${resultsEmailBlock}

  <div style="margin-bottom:28px;border-radius:10px;border:1.5px solid #e0e0e0;overflow:hidden;">
    <div style="background:#1D9E75;padding:10px 18px;">
      <span style="font-size:16px;font-weight:700;color:#fff;">📊 Today's Picks</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f5f5f5;">
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Pick</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Game</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Sport</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Type</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Odds</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">EV vs Pinnacle</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Book</th>
      </tr></thead>
      <tbody>${picksHtml}</tbody>
    </table>
    <div style="padding:8px 14px;background:#f9f9f9;font-size:11px;color:#999;border-top:1px solid #eee;">
      Dimmed rows have EV below 1% and are not included as value plays in content. EV calculated vs Pinnacle no-vig fair odds.
    </div>
  </div>

  ${section('🐦', 'Twitter / X', '#1da1f2', twitterHtml)}
  ${section('🤖', 'Reddit', '#ff4500', redditHtml)}
  ${section('🎵', 'TikTok', '#ff0050', tiktokHtml)}
  ${section('📸', 'Instagram', '#c13584', igHtml)}

  <div style="margin-top:28px;padding:14px 18px;background:#f5f5f5;border-radius:8px;font-size:11px;color:#888;text-align:center;">
    Generated by Capy Content Engine · <a href="https://getcapy.co" style="color:#1D9E75;">getcapy.co</a>
  </div>
</body>
</html>`;

    // ── 13. Build email subject ────────────────────────────────────────────────
    // Format: "Today's edges: [Team] +[EV]% and X others" — never uses "picks", "locks"
    let subject;
    if (!hasValidPicks) {
      subject = `Capy — No clear edges today (${todayDate})`;
    } else {
      const topPick = sharpPicks[0] || longshotPicks[0];
      const topEV   = topPick.ev_percent != null ? `+${parseFloat(topPick.ev_percent).toFixed(1)}%` : '';
      const others  = (sharpPicks.length + longshotPicks.length) - 1;
      subject = `Today's edges: ${topPick.pick} ${topEV}${others > 0 ? ` and ${others} other${others > 1 ? 's' : ''}` : ''} — ${todayDate}`;
    }
    if (followUp) subject += ' (Follow-up)';
    if (customPromptHint) subject += ` — ${customPromptHint.slice(0, 40)}`;

    // ── 14. Send via Resend ────────────────────────────────────────────────────
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Capy Content <onboarding@resend.dev>',
        to: process.env.OWNER_EMAIL,
        subject,
        html: emailHtml
      })
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      throw new Error(`Resend error ${emailRes.status}: ${JSON.stringify(emailData)}`);
    }

    console.log(`[generate-content] Done — ${sharpPicks.length} sharp, ${longshotPicks.length} longshot, ${noEvPicks.length} no-EV picks | email: ${emailData.id}`);

    return res.status(200).json({
      success:          true,
      picksUsed:        picks.length,
      sharpCount:       sharpPicks.length,
      longshotCount:    longshotPicks.length,
      noEvCount:        noEvPicks.length,
      hasValidPicks,
      emailId:          emailData.id,
      platforms:        ['twitter', 'reddit', 'tiktok', 'instagram'],
      followUp,
      customPromptHint: customPromptHint || null,
    });

  } catch (err) {
    console.error('[generate-content] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
