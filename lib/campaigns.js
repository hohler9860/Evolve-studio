// Campaign config = a rotating set of (region, category, query) tuples that the
// daily discovery cron rotates through. Each row maps 1:1 to a row in the
// `campaigns` table (seeded from this file in Phase 2).
//
// Targeting rationale: small, owner-operated service businesses that
// (a) live or die on local search, (b) typically have outdated WordPress sites,
// (c) have a phone number that actually reaches the owner.
//
// Cities chosen for density of mom-and-pop businesses and proximity to Henry
// during the summer (Boston metro + Westchester NY).

const BOSTON_CITIES = [
  'Boston, MA',
  'Cambridge, MA',
  'Somerville, MA',
  'Brookline, MA',
  'Newton, MA',
  'Watertown, MA',
  'Quincy, MA',
  'Medford, MA',
  'Arlington, MA',
  'Waltham, MA'
];

const WESTCHESTER_CITIES = [
  'White Plains, NY',
  'Yonkers, NY',
  'New Rochelle, NY',
  'Mount Vernon, NY',
  'Scarsdale, NY',
  'Rye, NY',
  'Mamaroneck, NY',
  'Harrison, NY',
  'Tarrytown, NY',
  'Pleasantville, NY'
];

// Categories chosen for: high web-presence importance, owner-operator structure,
// 1-15 employees typical, decent budget for a $2-5k website project.
const CATEGORIES = [
  'plumber',
  'electrician',
  'hvac contractor',
  'roofer',
  'landscaper',
  'painter',
  'general contractor',
  'auto repair shop',
  'auto body shop',
  'detail shop',
  'dentist',
  'orthodontist',
  'chiropractor',
  'med spa',
  'physical therapist',
  'optometrist',
  'family law attorney',
  'personal injury attorney',
  'estate planning attorney',
  'cpa',
  'tax preparer',
  'financial advisor',
  'insurance broker',
  'real estate broker',
  'mortgage broker',
  'hair salon',
  'barber shop',
  'nail salon',
  'spa',
  'tattoo shop',
  'gym',
  'pilates studio',
  'yoga studio',
  'martial arts school',
  'dance studio',
  'restaurant',
  'cafe',
  'bakery',
  'pizzeria',
  'caterer',
  'florist',
  'dry cleaner',
  'pet groomer',
  'veterinarian',
  'dog trainer',
  'photographer',
  'videographer',
  'wedding planner',
  'bridal shop',
  'jeweler'
];

function buildCampaigns() {
  const out = [];
  for (const city of BOSTON_CITIES) {
    for (const cat of CATEGORIES) {
      out.push({
        name: `${cat} — ${city}`,
        region: 'boston',
        category: cat,
        query_template: `${cat} in ${city}`,
        daily_cap: 25
      });
    }
  }
  for (const city of WESTCHESTER_CITIES) {
    for (const cat of CATEGORIES) {
      out.push({
        name: `${cat} — ${city}`,
        region: 'westchester',
        category: cat,
        query_template: `${cat} in ${city}`,
        daily_cap: 25
      });
    }
  }
  return out;
}

module.exports = {
  BOSTON_CITIES,
  WESTCHESTER_CITIES,
  CATEGORIES,
  buildCampaigns
};
