// Firecrawl wrapper for site scraping + screenshots.
// Used by api/cron/rate.js to capture each prospect's homepage.
//
// Endpoint: POST https://api.firecrawl.dev/v1/scrape
// Returns markdown + screenshot URL in one call.

function getApiKey() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured');
  return key;
}

/**
 * Scrape a single URL and grab a screenshot.
 * @param {string} url
 * @returns {Promise<{markdown:string, html:string, screenshot:string, metadata:object} | null>}
 */
async function scrapeWithScreenshot(url) {
  const key = getApiKey();

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'screenshot'],   // viewport (1280x800-ish), not @fullPage — Anthropic caps at 8000px and full-page sites blow past that
        onlyMainContent: false,
        timeout: 30000,
        waitFor: 1500,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[firecrawl] ${url} → ${response.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await response.json();
    if (!data?.success || !data?.data) return null;

    return {
      markdown: data.data.markdown || '',
      html: data.data.html || '',
      screenshot: data.data.screenshot || data.data['screenshot@fullPage'] || null,
      metadata: data.data.metadata || {},
    };
  } catch (err) {
    console.error(`[firecrawl] ${url} threw: ${err.message}`);
    return null;
  }
}

/**
 * Quick check whether a URL resolves at all (used for parked-domain detection).
 */
async function isReachable(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = { scrapeWithScreenshot, isReachable };
