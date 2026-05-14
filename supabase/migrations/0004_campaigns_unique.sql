-- 0004_campaigns_unique.sql
-- seed-campaigns.js does upsert with onConflict 'region,query_template' but
-- the original 0002 migration never added a unique constraint to back that.
-- Without this, re-running seed:campaigns inserts duplicate rows every time.

create unique index if not exists uniq_campaigns_region_query
  on public.campaigns (region, query_template);
