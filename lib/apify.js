// Apify wrapper for the cold-call discovery pipeline.
// Mirrors the batch+retry+timeout pattern from Hcontentagent/dashboard/server/scraper/apify.js.
//
// Primary actor: compass/crawler-google-places — pulls Google Maps results for a
// "{category} in {city}" query and returns structured business records (name,
// phone, website, address, place_id, rating, review_count, category, etc.).

function getApiToken() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN not configured');
  return token;
}

const GMAPS_ACTOR = 'compass~crawler-google-places';

/**
 * Scrape Google Maps for a list of search queries.
 * @param {string[]} queries - e.g. ["plumber in Boston, MA", "dentist in Cambridge, MA"]
 * @param {object} opts
 * @param {number} opts.maxPlacesPerQuery - default 30
 * @param {string} opts.country - default "us"
 * @returns {Promise<Array>} normalized business records
 */
async function scrapeGoogleMaps(queries, opts = {}) {
  const { maxPlacesPerQuery = 30, country = 'us' } = opts;
  const token = getApiToken();

  // Batch in groups of 5 — same pattern as Hcontentagent.
  const BATCH_SIZE = 5;
  const all = [];

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    console.log(`[apify-gmaps] batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(queries.length / BATCH_SIZE)}: ${batch.join(' | ')}`);

    try {
      const response = await fetch(
        `https://api.apify.com/v2/acts/${GMAPS_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=600`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray: batch,
            maxCrawledPlacesPerSearch: maxPlacesPerQuery,
            language: 'en',
            countryCode: country,
            scrapePlaceDetailPage: true,
            includeWebResults: false,
            skipClosedPlaces: true,
          }),
          signal: AbortSignal.timeout(660000),
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error(`[apify-gmaps] batch failed ${response.status}: ${text.slice(0, 200)}`);
        continue; // Don't kill the whole run for one bad batch.
      }

      const data = await response.json();
      all.push(...data.map(normalizeGmapsPlace));
      console.log(`[apify-gmaps] batch returned ${data.length} places`);
    } catch (err) {
      console.error(`[apify-gmaps] batch threw: ${err.message}`);
    }
  }

  return all;
}

function normalizeGmapsPlace(p) {
  return {
    name: p.title || '',
    phone_e164: normalizePhone(p.phone),
    website_url: p.website || null,
    address: p.address || null,
    city: p.city || null,
    state: p.state || null,
    zip: p.postalCode || null,
    google_place_id: p.placeId || null,
    google_rating: typeof p.totalScore === 'number' ? p.totalScore : null,
    google_review_count: typeof p.reviewsCount === 'number' ? p.reviewsCount : null,
    category: p.categoryName || (Array.isArray(p.categories) ? p.categories[0] : null),
    metadata: {
      hours: p.openingHours || null,
      url: p.url || null,
      claimed: p.claimed ?? null,
      permanently_closed: p.permanentlyClosed ?? null,
    },
  };
}

// Convert "(617) 555-1212" / "617-555-1212" / "+1 617 555 1212" → "+16175551212"
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null; // unrecognized
}

module.exports = { scrapeGoogleMaps, normalizePhone };
