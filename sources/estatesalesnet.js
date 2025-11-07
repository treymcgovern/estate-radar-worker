// sources/estatesalesnet.js
// Fetch listings (LIVE) from EstateSales.net, with a safe mock fallback for errors.

const dayjs = require('dayjs');

// --- config toggles -----------------------------------------------------------
// HARD-SET live mode. If you ever need to re-enable mock for testing, set to true.
const USE_MOCK = false;

// --- public API ---------------------------------------------------------------
/**
 * searchEstateSalesNet({ zip, radiusMi, maxPages })
 * Returns: { source: 'estatesales.net', listings: Array<NormalizedSale> }
 */
module.exports.searchEstateSalesNet = async function searchEstateSalesNet(opts = {}) {
  const zip = String(opts.zip || '');
  const radiusMi = Number(opts.radiusMi || 50);
  const maxPages = Number(opts.maxPages || 1);

  if (USE_MOCK) {
    const listings = mockListings();
    console.log(`[esm] returning ${listings.length} mock listings`);
    return { source: 'estatesales.net', listings };
  }

  try {
    console.log(`[esm] live fetch starting`, { zip, radiusMi, maxPages });

    // Minimal, resilient “live” fetch:
    // EstateSales.net doesn’t have a public JSON API, so we fetch their HTML “near me” search.
    // Example URL pattern (works for general proximity search by ZIP):
    // https://www.estatesales.net/estates?postalCode=93552&radius=50
    // We keep parsing super light to avoid brittle selectors.

    const url = `https://www.estatesales.net/estates?postalCode=${encodeURIComponent(
      zip
    )}&radius=${encodeURIComponent(radiusMi)}`;

    const res = await fetch(url, {
      // A user-agent avoids some generic bot blocks
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EstateRadarBot/1.0)' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from estatesales.net`);
    }

    const html = await res.text();

    // Tiny HTML parsing without dependencies:
    // We’ll extract sale “cards” by very loose patterns to get a few core fields.
    // If we can’t extract anything, we return an empty list (and the worker will log that).
    const listings = parseLightweight(html).map(normalize);

    console.log(`[esm] live fetch parsed ${listings.length} listing(s)`);
    return { source: 'estatesales.net', listings };
  } catch (err) {
    console.error(`[esm] live fetch error -> using mock fallback`, err.message || err);
    const listings = mockListings();
    return { source: 'estatesales.net', listings };
  }
};

// --- lightweight HTML parsing -------------------------------------------------
// This is intentionally simple and conservative: it looks for sale “rows” and
// pulls a title + address-ish line + optional city/state/time hints.
// If the site markup shifts, this will just return zero listings (safe).
function parseLightweight(html) {
  // Split by cards; very loose delimiter that tends to appear per listing
  const chunks = html.split(/<article[^>]*class="[^"]*estate-card[^"]*"[^>]*>/gi).slice(1);
  const items = [];

  for (const chunk of chunks) {
    // title
    const title = pickFirst([
      matchText(chunk, /<h2[^>]*>(.*?)<\/h2>/is),
      matchText(chunk, /<a[^>]*class="[^"]*estate-title[^"]*"[^>]*>(.*?)<\/a>/is),
    ]);

    // address-ish (often on a line near “map” or location)
    const address = pickFirst([
      matchText(chunk, /<div[^>]*class="[^"]*location[^"]*"[^>]*>(.*?)<\/div>/is),
      matchText(chunk, /<span[^>]*class="[^"]*address[^"]*"[^>]*>(.*?)<\/span>/is),
    ]);

    // time window (loose)
    const times = matchAllText(chunk, /\b(\w{3},?\s*\w{3}\s*\d{1,2}|\b\d{1,2}:\d{2}\s*(?:AM|PM))\b/gi);

    // directions (if a link exists)
    const directionsUrl = matchAttr(chunk, /<a[^>]*href="([^"]+maps[^"]*)"/i);

    if (title || address) {
      items.push({
        title: cleanText(title),
        address: cleanText(address),
        city: null,
        state: null,
        zip: null,
        lat: null,
        lng: null,
        hours_json: times && times.length ? JSON.stringify({ hints: times.slice(0, 4) }) : JSON.stringify({}),
        start_at: null,
        ends_at: null,
        distance_mi: null,
        directions_url: directionsUrl || null,
        created_at: new Date().toISOString(),
      });
    }
  }

  return items;
}

// --- helpers ------------------------------------------------------------------
function normalize(raw) {
  // Ensure all required fields exist; basic cleanup.
  const title = raw.title || 'Estate Sale';
  const address = raw.address || '';
  const city = raw.city || '';
  const state = raw.state || '';
  const zip = raw.zip || '';
  const hours_json = raw.hours_json || JSON.stringify({});
  const start_at = raw.start_at || null;
  const ends_at = raw.ends_at || null;
  const directions_url = raw.directions_url || null;
  const created_at = raw.created_at || new Date().toISOString();
  const distance_mi = raw.distance_mi == null ? null : Number(raw.distance_mi);
  const lat = raw.lat == null ? null : Number(raw.lat);
  const lng = raw.lng == null ? null : Number(raw.lng);

  return {
    title,
    address,
    city,
    state,
    zip,
    lat,
    lng,
    start_at,
    ends_at,
    hours_json,
    distance_mi,
    directions_url,
    created_at,
  };
}

function matchText(s, re) {
  const m = s.match(re);
  return m ? m[1] : null;
}

function matchAllText(s, re) {
  const out = [];
  let m;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}

function matchAttr(s, re) {
  const m = s.match(re);
  return m ? m[1] : null;
}

function cleanText(s) {
  if (!s) return s;
  // strip tags and entities lightly
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// --- minimal mock (fallback only) ---------------------------------------------
function mockListings() {
  const now = dayjs().toISOString();
  return [
    {
      title: 'Railway Worker Test Sale',
      address: '456 Worker Ave',
      city: 'Palmdale',
      state: 'CA',
      zip: '93552',
      lat: 34.58,
      lng: -118.12,
      start_at: now,
      ends_at: now,
      hours_json: JSON.stringify({ sat: ['09:00–15:00'] }),
      distance_mi: 4.2,
      directions_url:
        'https://www.google.com/maps/dir/456+Worker+Ave,+Palmdale,+CA+93552',
      created_at: now,
    },
  ];
}
