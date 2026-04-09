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
    const fmtPick = (p, label) => {
      const ev   = p.ev_percent != null ? `+${parseFloat(p.ev_percent).toFixed(1)}%` : 'EV unknown';
      const odds = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
      return `  ${label} ${p.pick} ${odds} (${p.book}) vs Pinnacle → ${ev} EV | Game: ${p.away_team} @ ${p.home_team} [${p.sport || '?'}]`;
    };

    const sharpText = sharpPicks.length
      ? `SHARP PICKS (EV ≥1%, odds -200 to +300):\n${sharpPicks.map(p => fmtPick(p, '•')).join('\n')}\n\n`
      : '';

    const longshotText = longshotPicks.length
      ? `LONG SHOT PLAYS (EV ≥1%, odds +300 to +1500 — high variance, expected hit rate ~15-25%):\n${longshotPicks.map(p => fmtPick(p, '⚡')).join('\n')}\n\n`
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
      const lines = yesterdayResults.map(r => {
        const p = r.picks || {};
        const odds = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
        const outcome = r.outcome === 'win' ? 'WIN' : r.outcome === 'loss' ? 'LOSS' : 'PUSH';
        return `  ${p.pick} ${odds} — ${outcome}`;
      });
      resultsContextForPrompt = `YESTERDAY'S RESOLVED RESULTS (reference these honestly in Reddit and follow-up content):\n${lines.join('\n')}\n\n`;
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

    const prompt = `You are the analytical content voice for Capy (getcapy.co).

WHAT CAPY IS: A market inefficiency tool that compares sportsbook odds to Pinnacle's sharp line to find mispriced odds. NOT a picks page. NOT a tout service.
CORE MESSAGE: "Books move at different speeds. We find where they're wrong."

ABSOLUTE BRAND RULES — never violate these:
- NEVER USE: "hot picks", "lock", "go-to expert", "can they pull it off", "bet like a pro", "potential payout feels", "guaranteed", "locks", "fire play", "best bet"
- ALWAYS USE: data-first language — show the math, cite the EV, name the books
- Voice: analytical, direct, humble, credible — like a sharp bettor sharing research, not a tout selling picks
- Never claim guaranteed wins — always frame as edges and probabilities
- If uncertain, say so. Honesty builds more credibility than hype.

TODAY'S DATA (${todayDate}):
${sharpText}${longshotText}${noEvText}${resultsContextForPrompt}${followUpContext}${hintLine}${methodologyFallbackInstruction}

Generate a JSON object (raw JSON only — no markdown, no backticks, no explanation) with this exact structure. Follow the format templates exactly:

{
  "twitter": [
    "Tweet 1 — Sharp pick format: '[Team] [Odds] ([Book])\\n+[EV]% vs Pinnacle sharp line\\n[one honest, specific sentence about why the edge exists]\\ngetcapy.co' — max 220 chars total",
    "Tweet 2 — Explain the WHY: reference the specific gap between the book and Pinnacle's fair price, what sport, what the number means. Still data-first, no hype.",
    "Tweet 3 — If a longshot pick exists, use: '[Team] [Odds] ([Book])\\nLong shot — lower probability but price looks off vs market\\ngetcapy.co'. If no longshot, write a third data-focused tweet about the methodology or another sharp pick."
  ],
  "reddit": {
    "title": "A specific, factual title referencing what the tool found today — not clickbait, not an ad. Example: 'Tool I built found a +2.4% EV edge on [Team] vs Pinnacle today'",
    "body": "Under 150 words. Lead with what the tool does, not what the pick is. Include one specific example with actual EV shown. If yesterday had results, mention them honestly at the top. End with a genuine question to invite discussion. Never sound like an ad. Format: first line = what the tool does. Second section = today's clearest edge with real numbers. Third line = honest caveat about line efficiency. Final line = genuine question."
  },
  "tiktok": {
    "hook": "A question or counterintuitive statement about betting math — NOT hype. Choose one: 'Most +2000 bets are terrible. But sometimes the price is just wrong.' OR 'Sportsbooks aren't always right. Here is how you can tell.' OR 'This is what sharp bettors actually look for.'",
    "script": "Max 8 short conversational lines. Explain WHY the specific line looks off using today's actual data. End with what the tool does — not a call to action or download prompt. Each line on its own line in the string, separated by \\n.",
    "caption": "TikTok caption — analytical tone, no hype. Include: #sportsbetting #expectedvalue #sharpbetting #valuebets #pinnacle #getcapy"
  },
  "instagram": {
    "caption": "3-4 sentences. Lead with the insight, not the pick. Show the math: book odds vs fair odds vs EV. Analytical tone — no exclamation marks on data statements.",
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
            content: 'You are a sports analytics content writer for Capy (getcapy.co). Return only valid JSON, no markdown, no backticks, no explanation. Return only a single valid JSON object. No newlines inside string values except where explicitly shown as \\n. Escape all apostrophes as \\u0027. Never use the words: hot picks, lock, guaranteed, bet like a pro.'
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
