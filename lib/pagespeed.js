// PageSpeed Insights wrapper. Pulls the three Lighthouse scores we feed
// into the Claude rater (performance, SEO, accessibility).
//
// Free Google API. No auth required for low volume but a key dramatically
// raises the rate limit — pass GOOGLE_PSI_API_KEY in env.
//
// Docs: https://developers.google.com/speed/docs/insights/v5/get-started

async function getLighthouseScores(url) {
  const apiKey = process.env.GOOGLE_PSI_API_KEY || '';
  const params = new URLSearchParams({
    url,
    strategy: 'mobile',
    category: 'performance',
  });
  // Add SEO + a11y as repeated category params.
  const qs = `${params.toString()}&category=seo&category=accessibility${apiKey ? `&key=${apiKey}` : ''}`;

  try {
    const response = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`,
      { signal: AbortSignal.timeout(60000) }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[psi] ${url} → ${response.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await response.json();
    const cats = data?.lighthouseResult?.categories || {};

    return {
      performance:   pct(cats.performance?.score),
      seo:           pct(cats.seo?.score),
      accessibility: pct(cats.accessibility?.score),
    };
  } catch (err) {
    console.error(`[psi] ${url} threw: ${err.message}`);
    return null;
  }
}

function pct(score) {
  if (typeof score !== 'number') return null;
  return Math.round(score * 100);
}

module.exports = { getLighthouseScores };
