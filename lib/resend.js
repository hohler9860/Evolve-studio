// Resend helper for Henry-facing notifications.
// Pattern lifted from ~/IdeaProjects/DialedbyH/api/submit-form.js.

const FROM_DEFAULT = 'evolve studio <onboarding@resend.dev>';

async function sendEmail({ to, subject, html, from = FROM_DEFAULT }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`resend ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function notifyMeetingBooked({ business, contact, scheduledFor, zoomUrl }) {
  const to = process.env.NOTIFY_EMAIL || 'dialedbyh@gmail.com';
  const subject = `📞 New booked meeting — ${business.name}`;
  const html = `
    <h2>New meeting booked</h2>
    <p><b>${escape(business.name)}</b> ${business.city ? `· ${escape(business.city)}, ${escape(business.state)}` : ''}</p>
    <p>Contact: ${escape(contact?.full_name || 'unknown')} ${contact?.title ? `(${escape(contact.title)})` : ''}</p>
    <p>When: <b>${new Date(scheduledFor).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</b></p>
    <p>Zoom: <a href="${zoomUrl}">${zoomUrl}</a></p>
    <p>Site to mock up: <a href="${business.website_url || '#'}">${escape(business.website_url || 'no current site')}</a></p>
    <p style="color:#888;font-size:12px">Booked by your AI agent. Mock-up reminder lands in the Mockup Pipeline sheet.</p>
  `;
  return sendEmail({ to, subject, html });
}

async function sendDailySummary({ stats }) {
  const to = process.env.NOTIFY_EMAIL || 'dialedbyh@gmail.com';
  const subject = `📊 Evolve daily summary — ${stats.date}`;
  const html = `
    <h2>${stats.date}</h2>
    <ul>
      <li>discovered: <b>${stats.discovered}</b> raw leads</li>
      <li>rated: <b>${stats.rated}</b> sites · ${stats.disqualified} disqualified</li>
      <li>scripts generated: <b>${stats.scripts}</b></li>
      <li>calls placed: <b>${stats.calls_placed}</b> · connected: <b>${stats.calls_connected}</b></li>
      <li>meetings booked: <b>${stats.meetings_booked}</b></li>
      <li>opt-outs: <b>${stats.opt_outs}</b> ${stats.opt_outs > 0 ? '⚠️' : ''}</li>
      <li>est. cost today: <b>$${(stats.cost_usd || 0).toFixed(2)}</b></li>
    </ul>
    ${stats.opt_outs / Math.max(stats.calls_connected, 1) > 0.05 ? `<p style="color:#c00"><b>⚠️ Opt-out rate &gt;5% — review script tone.</b></p>` : ''}
  `;
  return sendEmail({ to, subject, html });
}

function escape(s) {
  return String(s ?? '').replace(/[<>&"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;' }[c]));
}

/**
 * Send a follow-up email to a prospect with their personalized mockup pitch + booking link.
 * Used by the EL agent's send_followup tool (mid-call) and the post-call webhook
 * when a connected call didn't book.
 */
async function sendProspectFollowup({ to, businessName, ownerFirstName, topIssue, bookingLink, voicemail = false }) {
  if (!to) throw new Error('to email required');
  const subject = voicemail
    ? `Tried calling — quick note re: ${businessName}'s site`
    : `Following up — Henry @ Evolve Studio (${businessName})`;

  const greeting = ownerFirstName && ownerFirstName !== 'there' ? `Hey ${ownerFirstName},` : 'Hey,';
  const intro = voicemail
    ? `Tried catching you on the phone just now about ${businessName}'s website.`
    : `Thanks for the quick chat earlier about ${businessName}'s website.`;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; line-height: 1.5; color: #222;">
      <p>${greeting}</p>
      <p>${intro}</p>
      <p>The thing that stood out: <b>${escape(topIssue || 'a few quick wins on your current site')}</b>.</p>
      <p>I'll mock up a sample homepage for ${escape(businessName)} before we hop on so you can see exactly what's possible — no proposal deck, no pressure. Just 15 minutes.</p>
      <p style="margin: 20px 0;">
        <a href="${bookingLink}" style="background:#000;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500">Grab a time on my calendar →</a>
      </p>
      <p>Or hit reply with a couple times that work for you.</p>
      <p>— Henry<br>Evolve Studio<br><a href="https://www.evolvestudio.info">evolvestudio.info</a></p>
    </div>
  `;

  return sendEmail({ to, subject, html, from: 'Henry @ Evolve Studio <hello@evolvestudio.info>' });
}

module.exports = { sendEmail, notifyMeetingBooked, sendDailySummary, sendProspectFollowup };
