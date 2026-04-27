// /api/cron/rate — rate every business that has a website but no site_rating yet.
//
// Steps per business:
//   1. Skip if no website_url, or if disqualified.
//   2. Firecrawl scrape (markdown + screenshot).
//   3. PageSpeed Insights mobile Lighthouse.
//   4. Upload screenshot → Supabase Storage 'screenshots' bucket.
//   5. Claude Opus rateSite() with cached rubric.
//   6. Insert into site_ratings.
//   7. Auto-disqualify if rating > 7 or no markdown returned (parked / blank).
//
// Runs in batches of 10 to keep within Vercel function timeout (60s on Pro).

const { getDB } = require('../../db');
const { scrapeWithScreenshot, isReachable } = require('../../firecrawl');
const { getLighthouseScores } = require('../../pagespeed');
const { rateSite } = require('../../claude');

const BATCH_SIZE = 10;

module.exports = async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const db = getDB();

    // Get all already-rated business IDs so we can exclude them at SQL level.
    const { data: alreadyRated } = await db.from('site_ratings').select('business_id');
    const ratedIds = (alreadyRated || []).map(r => r.business_id);

    let q = db
      .from('businesses')
      .select('id, name, website_url')
      .not('website_url', 'is', null)
      .is('disqualified_reason', null);
    if (ratedIds.length) q = q.not('id', 'in', `(${ratedIds.join(',')})`);
    const { data: targets, error: pendingErr } = await q.limit(BATCH_SIZE);
    if (pendingErr) throw pendingErr;

    if (!targets?.length) return res.json({ ok: true, message: 'nothing to rate' });

    const results = { rated: 0, disqualified: 0, errors: 0 };

    for (const biz of targets) {
      try {
        // Cheap reachability check first to avoid Firecrawl on dead domains.
        const reachable = await isReachable(biz.website_url);
        if (!reachable) {
          await db.from('businesses').update({
            disqualified_reason: 'parked_domain',
          }).eq('id', biz.id);
          results.disqualified++;
          continue;
        }

        const [scrape, lighthouse] = await Promise.all([
          scrapeWithScreenshot(biz.website_url),
          getLighthouseScores(biz.website_url),
        ]);

        if (!scrape || !scrape.markdown || scrape.markdown.length < 200) {
          await db.from('businesses').update({
            disqualified_reason: 'parked_domain',
          }).eq('id', biz.id);
          results.disqualified++;
          continue;
        }

        // Upload screenshot if present.
        let screenshotUrl = null;
        if (scrape.screenshot) {
          screenshotUrl = await uploadScreenshot(db, biz.id, scrape.screenshot);
        }

        const rating = await rateSite({
          business_name: biz.name,
          website_url: biz.website_url,
          markdown: scrape.markdown,
          lighthouse,
          screenshot_url: scrape.screenshot,
        });

        await db.from('site_ratings').insert({
          business_id: biz.id,
          rating_1_to_10: rating.rating,
          issues: rating.issues,
          selling_points: rating.selling_points,
          screenshot_url: screenshotUrl,
          lighthouse_perf: lighthouse?.performance ?? null,
          lighthouse_seo: lighthouse?.seo ?? null,
          lighthouse_a11y: lighthouse?.accessibility ?? null,
          rater_model: rating.model,
          prompt_cache_hit: rating.prompt_cache_hit,
        });

        // Auto-disqualify if rating > 7 (they don't need us).
        if (rating.rating > 7) {
          await db.from('businesses').update({
            disqualified_reason: 'rating_too_high',
          }).eq('id', biz.id);
          results.disqualified++;
        } else {
          results.rated++;
        }
      } catch (err) {
        console.error(`[cron/rate] business ${biz.id} failed:`, err.message);
        results.errors++;
      }
    }

    res.json({ ok: true, batch_size: targets.length, ...results });
  } catch (err) {
    console.error('[cron/rate] failed:', err);
    res.status(500).json({ error: err.message || 'rate failed' });
  }
};

async function uploadScreenshot(db, businessId, screenshotUrlOrData) {
  try {
    let body;
    let contentType = 'image/png';

    if (screenshotUrlOrData.startsWith('data:')) {
      // base64 data URL
      const match = screenshotUrlOrData.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return null;
      contentType = match[1];
      body = Buffer.from(match[2], 'base64');
    } else if (screenshotUrlOrData.startsWith('http')) {
      // remote URL — fetch it
      const resp = await fetch(screenshotUrlOrData, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;
      body = Buffer.from(await resp.arrayBuffer());
      contentType = resp.headers.get('content-type') || contentType;
    } else {
      // raw base64
      body = Buffer.from(screenshotUrlOrData, 'base64');
    }

    const path = `${businessId}.png`;
    const { error } = await db.storage.from('screenshots').upload(path, body, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.error('[cron/rate] screenshot upload failed:', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error('[cron/rate] uploadScreenshot threw:', err.message);
    return null;
  }
}

function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${expected}`;
}
