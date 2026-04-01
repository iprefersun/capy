// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   GROQ_API_KEY
//   RESEND_API_KEY
//   OWNER_EMAIL

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  try {
    // ── 1. Supabase: fetch today's picks ────────────────────────────────
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const today = new Date().toISOString().split('T')[0];
    const { data: picks, error: dbError } = await supabase
      .from('picks')
      .select('*')
      .gte('created_at', today)
      .order('ev_percent', { ascending: false })
      .limit(5);

    if (dbError) throw new Error(`Supabase error: ${dbError.message}`);
    if (!picks || picks.length === 0) {
      return res.status(200).json({ message: 'No picks found for today' });
    }

    // ── 2. Format picks into readable text ──────────────────────────────
    const todayDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Sanitize EV values — Supabase sometimes stores 315.7 instead of 3.157
    const sanitizedPicks = picks.map(p => ({
      ...p,
      ev_percent: p.ev_percent > 100 ? (p.ev_percent / 100).toFixed(1) : p.ev_percent
    }));

    const picksText = sanitizedPicks.map((p, i) => {
      const ev = p.ev_percent != null ? `${p.ev_percent > 0 ? '+' : ''}${parseFloat(p.ev_percent).toFixed(1)}% EV` : 'EV unknown';
      const odds = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
      return `${i + 1}. ${p.pick} (${p.home_team} vs ${p.away_team}) — ${odds} at ${p.book} — ${ev}`;
    }).join('\n');

    // ── 3. Call Groq API ─────────────────────────────────────────────────
    const prompt = `You are the social media voice for Capy, a sports betting analytics tool at getcapy.co. Capy is a capybara who finds value in betting markets using expected value (EV) calculations vs Pinnacle's sharp line. Tone: confident, data-driven, fun, never guarantee wins, always note these are mathematical edges not certainties.

Today's top picks (${todayDate}):
${picksText}

Generate a JSON object (no markdown, no backticks, raw JSON only) with this exact structure:
{
  "twitter": [
    "tweet 1 text (max 280 chars, include real numbers, end with getcapy.co)",
    "tweet 2 text (angle: the math/EV angle, different from tweet 1)",
    "tweet 3 text (angle: entertainment/excitement, include potential payout feel)"
  ],
  "reddit": {
    "title": "post title for r/sportsbook or r/sportsbetting (no spam, genuine value share)",
    "body": "post body (2-4 paragraphs, explain the EV methodology, share the picks with context, mention getcapy.co naturally)"
  },
  "tiktok": {
    "hook": "opening line to say on camera (attention-grabbing, max 10 words)",
    "script": "full 30-60 second script broken into short punchy lines, each on its own line",
    "caption": "TikTok caption with hashtags"
  },
  "instagram": {
    "caption": "Instagram caption (engaging, 3-5 sentences, storytelling tone, real numbers from picks)",
    "hashtags": "#sportsbetting #expectedvalue #capybara #getcapy #sharpbetting #valuebets #nba #nfl #mlb #nhl #sportspicks"
  }
}`;

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
            content: 'You are a sports betting content writer for Capy (getcapy.co). Return only valid JSON, no markdown, no backticks, no explanation. Return only a single valid JSON object. No newlines inside string values. No special characters inside strings. Escape all apostrophes.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
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

    // ── 4. Parse JSON — strip backticks and control characters ──────────
    const cleaned = rawContent
      .replace(/```json|```/g, '')
      .replace(/[\x00-\x1F\x7F]/g, ' ') // remove control characters
      .trim();
    let content;
    try {
      content = JSON.parse(cleaned);
    } catch (parseErr) {
      throw new Error(`Failed to parse Groq JSON: ${parseErr.message}\nRaw: ${rawContent.slice(0, 500)}`);
    }

    // ── 5. Build HTML email ──────────────────────────────────────────────
    const section = (emoji, title, color, html) => `
      <div style="margin-bottom:28px;border-radius:10px;border:1.5px solid ${color};overflow:hidden;">
        <div style="background:${color};padding:10px 18px;">
          <span style="font-size:16px;font-weight:700;color:#fff;">${emoji} ${title}</span>
        </div>
        <div style="padding:16px 18px;background:#fafafa;font-family:monospace;font-size:13px;line-height:1.7;color:#222;">
          ${html}
        </div>
      </div>`;

    const twitterHtml = (content.twitter || []).map((t, i) =>
      `<div style="margin-bottom:12px;padding:10px 12px;background:#e8f4fd;border-radius:6px;border-left:3px solid #1da1f2;">
        <strong>Tweet ${i + 1}</strong><br>${t.replace(/\n/g, '<br>')}
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
        <div style="white-space:pre-wrap;background:#fff;padding:10px;border-radius:6px;border:1px solid #ddd;margin-top:4px;">${content.tiktok?.script || ''}</div>
      </div>
      <div><strong>Caption:</strong> ${content.tiktok?.caption || ''}</div>`;

    const igHtml = `
      <div style="margin-bottom:8px;white-space:pre-wrap;background:#fff;padding:10px;border-radius:6px;border:1px solid #ddd;">${content.instagram?.caption || ''}</div>
      <div style="color:#888;font-size:12px;">${content.instagram?.hashtags || ''}</div>`;

    const picksHtml = picks.map(p => {
      const ev = p.ev_percent != null ? `${p.ev_percent > 0 ? '+' : ''}${p.ev_percent.toFixed(1)}%` : '—';
      const odds = p.odds > 0 ? `+${p.odds}` : `${p.odds}`;
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.pick}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:12px;">${p.home_team} vs ${p.away_team}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;">${odds}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:700;color:${p.ev_percent > 0 ? '#1D9E75' : '#888'};">${ev}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:12px;">${p.book}</td>
      </tr>`;
    }).join('');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Inter',Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#222;background:#fff;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-size:32px;">🦫</div>
    <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:900;margin:8px 0 4px;">Capy Daily Content</h1>
    <div style="font-size:13px;color:#888;">${todayDate}</div>
  </div>

  <div style="margin-bottom:28px;border-radius:10px;border:1.5px solid #e0e0e0;overflow:hidden;">
    <div style="background:#1D9E75;padding:10px 18px;">
      <span style="font-size:16px;font-weight:700;color:#fff;">📊 Today's Picks</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f5f5f5;">
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Pick</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Game</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Odds</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">EV</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Book</th>
      </tr></thead>
      <tbody>${picksHtml}</tbody>
    </table>
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

    // ── 6. Send via Resend ───────────────────────────────────────────────
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Capy Content <onboarding@resend.dev>',
        to: process.env.OWNER_EMAIL,
        subject: `🦫 Capy Daily Content — ${todayDate}`,
        html: emailHtml
      })
    });

    const emailData = await emailRes.json();
    if (!emailRes.ok) {
      throw new Error(`Resend error ${emailRes.status}: ${JSON.stringify(emailData)}`);
    }

    return res.status(200).json({
      success: true,
      picksUsed: picks.length,
      emailId: emailData.id,
      platforms: ['twitter', 'reddit', 'tiktok', 'instagram']
    });

  } catch (err) {
    console.error('[generate-content] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
