// Apollo.io wrapper for owner / decision-maker contact enrichment.
//
// Strategy: people search filtered by organization_name + city + a set of
// owner-ish titles (Owner, President, CEO, Founder, GM, Operations Manager).
// Apollo's match endpoint is per-person and pricier; for cold outbound we want
// to *find* the owner from a business name + location, not match a known person.
//
// Docs: https://docs.apollo.io/reference/people-search

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

const OWNER_TITLES = [
  'owner', 'co-owner', 'founder', 'co-founder', 'president', 'ceo',
  'general manager', 'gm', 'managing partner', 'operations manager',
  'operations director', 'office manager'
];

function getApiKey() {
  const k = process.env.APOLLO_API_KEY;
  if (!k) throw new Error('APOLLO_API_KEY not configured');
  return k;
}

/**
 * Find the most likely owner/decision-maker for a business.
 * @param {object} biz
 * @param {string} biz.name
 * @param {string} [biz.city]
 * @param {string} [biz.state]
 * @param {string} [biz.website_url]
 * @returns {Promise<Array>} normalized contacts (best-first)
 */
async function findOwner(biz) {
  const key = getApiKey();

  const body = {
    q_organization_name: biz.name,
    person_titles: OWNER_TITLES,
    person_locations: biz.city && biz.state ? [`${biz.city}, ${biz.state}, US`] : undefined,
    page: 1,
    per_page: 5,
  };

  // Optional: tighten by website domain when present
  if (biz.website_url) {
    try {
      const host = new URL(biz.website_url).host.replace(/^www\./, '');
      body.q_organization_domains_list = [host];
    } catch { /* ignore parse failure */ }
  }

  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'X-Api-Key': key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[apollo] search failed ${res.status}: ${text.slice(0, 200)}`);
      return [];
    }

    const data = await res.json();
    const people = data?.people || data?.contacts || [];
    return people.map(normalizePerson).filter(c => c.full_name);
  } catch (err) {
    console.error('[apollo] threw:', err.message);
    return [];
  }
}

function normalizePerson(p) {
  return {
    full_name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
    first_name: p.first_name || null,
    last_name: p.last_name || null,
    title: p.title || null,
    direct_phone_e164: e164(p.direct_phone || p.organization?.primary_phone?.number),
    mobile_phone_e164: e164(p.mobile_phone),
    email: p.email && !p.email.startsWith('email_not_unlocked') ? p.email : null,
    confidence: typeof p.email_confidence === 'number' ? p.email_confidence : null,
    metadata: {
      apollo_id: p.id || null,
      linkedin: p.linkedin_url || null,
      organization_id: p.organization?.id || null,
    },
  };
}

function e164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

module.exports = { findOwner };
