// Anthropic Claude wrapper with prompt caching.
//
// Two call sites in this codebase:
//   1. api/cron/rate.js          → rate a prospect's website 1-10 + extract issues + selling points
//   2. api/cron/generate-scripts.js → write a 60-90s personalized cold-call script
//
// Both share heavy system prompts (rubric / Henry's voice examples) that we mark
// `cache_control: { type: "ephemeral" }` so we get >90% cache hit rate and ~70%
// off the per-call cost.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL_RATING = 'claude-opus-4-7';   // high-stakes judgment, justifies cost
const MODEL_SCRIPT = 'claude-sonnet-4-6'; // creative writing, sonnet is plenty

let _client = null;
function getClient() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// =============================================================================
// 1. site rating
// =============================================================================

const RATING_RUBRIC = `You are evaluating small-business websites on behalf of Evolve Studio, a web design studio that builds modern Next.js / Webflow / Framer sites for local businesses ($2-5k typical project).

Your job: rate the site 1-10 on whether it would benefit from being rebuilt, list specific issues, and extract concrete selling points Evolve could mention on a cold call.

Rating scale:
- 1-3: catastrophic. Site is broken, unsafe, or actively losing the business money. Unmissable opportunity.
- 4-6: dated and underperforming. Wordpress from ~2015, slow, not mobile-friendly, weak conversion path. Strong opportunity.
- 7-8: decent but improvable. Probably built by a freelancer 2-3 years ago. Mid opportunity — not a top priority for outbound.
- 9-10: modern, fast, well-converted. Skip — they don't need us.

Issues to look for (cite specific ones in your output):
- Mobile responsiveness (look at the screenshot at small widths)
- Page load speed (Lighthouse perf score under 50 = bad)
- SEO basics (title, meta description, H1 — Lighthouse SEO under 70 = bad)
- Accessibility (alt text, color contrast — under 70 = bad)
- Visual design (dated stock photos, default WordPress theme, broken layout, busy/cluttered)
- Conversion path (no obvious phone CTA, no booking link, no clear pricing, no contact form)
- Trust signals (no SSL, broken images, lorem ipsum, "powered by GoDaddy")
- Outdated content (hours wrong, "© 2018", events from years ago)
- Missing content (no services list, no team, no portfolio, no reviews)

Selling points to surface (1-3 short bullets, plain spoken — these become the talking points on the call):
- Most acute single issue ("I noticed your contact form isn't working on mobile")
- A specific industry-relevant improvement Evolve could make ("for a plumber, online booking with same-day appointment slots")
- A trust signal Evolve could add ("you have 200+ Google reviews, but they're invisible on the site — we'd put them front and center")

Output STRICT JSON only:
{
  "rating": <int 1-10>,
  "issues": ["...", "..."],
  "selling_points": ["...", "...", "..."],
  "summary": "<one sentence, plain English>"
}`;

/**
 * Rate a single prospect site.
 * @param {object} input
 * @param {string} input.business_name
 * @param {string} input.website_url
 * @param {string} input.markdown - Firecrawl markdown of homepage
 * @param {{performance:number, seo:number, accessibility:number}|null} input.lighthouse
 * @param {string|null} input.screenshot_url - optional screenshot URL or data: URL for Claude vision
 */
async function rateSite(input) {
  const client = getClient();

  const userBlocks = [
    {
      type: 'text',
      text: `Business: ${input.business_name}
URL: ${input.website_url}
Lighthouse mobile: ${input.lighthouse ? `perf ${input.lighthouse.performance}, SEO ${input.lighthouse.seo}, a11y ${input.lighthouse.accessibility}` : 'unavailable'}

--- HOMEPAGE MARKDOWN ---
${(input.markdown || '').slice(0, 12000)}`
    }
  ];

  if (input.screenshot_url) {
    // Anthropic supports two image source formats: url-based and base64.
    // Firecrawl returns HTTPS URLs; raw base64 also valid for fallback.
    const isUrl = /^https?:\/\//i.test(input.screenshot_url);
    userBlocks.push({
      type: 'image',
      source: isUrl
        ? { type: 'url', url: input.screenshot_url }
        : { type: 'base64', media_type: 'image/png', data: input.screenshot_url.replace(/^data:image\/\w+;base64,/, '') },
    });
  }

  const response = await client.messages.create({
    model: MODEL_RATING,
    max_tokens: 1024,
    system: [
      { type: 'text', text: RATING_RUBRIC, cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: userBlocks }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const cached = (response.usage?.cache_read_input_tokens || 0) > 0;

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
  } catch (err) {
    console.error('[claude.rateSite] failed to parse JSON:', text.slice(0, 500));
    throw new Error('rating parse failure');
  }

  return {
    rating: parsed.rating,
    issues: parsed.issues || [],
    selling_points: parsed.selling_points || [],
    summary: parsed.summary || '',
    model: MODEL_RATING,
    prompt_cache_hit: cached,
  };
}

// =============================================================================
// 2. script generation
// =============================================================================

const SCRIPT_SYSTEM = `You are writing personalized 60-90 second cold-call scripts for Henry, founder of Evolve Studio (a small-business web design studio in Boston).

Henry's voice: confident, direct, no jargon. He talks like a 20-year-old entrepreneur because he is one — he's young, hungry, and that lands well with owner-operators because they relate. He doesn't oversell. He leads with a specific observation about THEIR site (not a generic "I help businesses grow"). He asks for 15 minutes, not a sale.

The script is read by an AI voice agent calling on Henry's behalf — Henry has cloned his voice. The opener MUST contain two disclosures, baked into a single natural-sounding line:
  1. AI disclosure (FCC 2024 rule on artificial voice calls)
  2. Recording disclosure (Massachusetts two-party consent — applied to all calls regardless of state)

Structure:
- opener: 2 sentences, ~12 seconds. Includes both disclosures naturally. Then asks if it's a bad time.
- talking_points: 3-4 bullets (1 sentence each). The first bullet is the most acute site issue. Bullets 2-3 are the selling points. Bullet 4 is the soft pitch.
- objection_handlers: 3 bullets. Map "we already have a guy" / "we're not interested" / "send me an email" to one-sentence responses.
- closer: 1-2 sentences asking for a 15-minute Zoom this week. Mentions Henry will mock up a sample home page before the call so they can see what's possible.

Tone rules:
- No "I hope this finds you well." No "circling back." No "synergy."
- Use first names if known.
- Reference one specific thing about their business that you observed (industry, location, # of reviews).
- Never lie. Never invent stats.
- Every script must end with the booking-link variable {{booking_link}}.

Output STRICT JSON:
{
  "opener": "...",
  "talking_points": ["...", "...", "..."],
  "objection_handlers": ["...", "...", "..."],
  "closer": "..."
}`;

/**
 * Generate a personalized script for one prospect.
 */
async function generateScript(input) {
  const client = getClient();

  const userText = `Business: ${input.business_name}
City: ${input.city || 'unknown'}
Category: ${input.category || 'unknown'}
Owner first name: ${input.owner_first_name || 'unknown'}
Site rating: ${input.rating}/10
Most pressing issues: ${(input.issues || []).slice(0, 3).join('; ')}
Selling points to weave in: ${(input.selling_points || []).slice(0, 3).join('; ')}

Booking link: {{booking_link}}

Write the script.`;

  const response = await client.messages.create({
    model: MODEL_SCRIPT,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SCRIPT_SYSTEM, cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: userText }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
  } catch {
    console.error('[claude.generateScript] failed to parse JSON:', text.slice(0, 500));
    throw new Error('script parse failure');
  }

  return {
    opener: parsed.opener,
    talking_points: parsed.talking_points || [],
    objection_handlers: parsed.objection_handlers || [],
    closer: parsed.closer,
    model: MODEL_SCRIPT,
  };
}

module.exports = { rateSite, generateScript, MODEL_RATING, MODEL_SCRIPT };
