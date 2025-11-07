// sources/estatesalesnet.js
// Minimal HTML fetcher with defensive parsing + verbose logging.

const cheerio = require('cheerio');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Build a best-guess search URL for estatesales.net (city/zip + radius)
function buildUrl({ zip, radiusMi }) {
  // estatesales.net has multiple routes; this generic search page tends to work:
  // e.g. https://www.estatesales.net/estate-sales?searchZip=93552&radius=50
  const u = new URL('https://www.estatesales.net/estate-sales');
  u.searchParams.set('searchZip', zip);
  u.searchParams.set('radius', String(radiusMi || 50));
  return u.toString();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function parseListings(html) {
  const $ = cheerio.load(html);
  const out = [];

  // The site markup can change. This targets common card patterns.
  $('.card, .sale-card, .item, .listing, .sale').each((_, el) => {
    const $el = $(el);

    // title
    const title =
      $el.find('h2, .card-title, .title, .sale-title').first().text().trim() ||
      $el.find('a').first().text().trim();

    // address/city/state/zip often live together; split heuristically
    const addrText =
      $el.find('.address, .location, .sale-location').first().text().trim();

    // Dates / times are all over the place; capture as a single string
    const dateText =
      $el.find('.dates, .sale-dates, time').first().text().trim() ||
      $el.find('.card-body').text().trim();

    // Try to extract a detail link (often contains the sale id)
    let href =
      $el.find('a[href*="/estate-sales/"]').attr('href') ||
      $el.find('a[href*="/sales/"]').attr('href') ||
      $el.find('a').attr('href');
    if (href && href.startsWith('/')) {
      href = `https://www.estatesales.net${href}`;
    }

    // Attempt to derive a source_id from URL (numbers in path)
    let sourceId = null;
    if (href) {
      const m = href.match(/(\d{5,})/);
      if (m) sourceId = m[1];
    }

    // Split address line if present
    let address = null, city = null, state = null, zip = null;
    if (addrText) {
      // Example patterns: "123 Main St, Palmdale, CA 93552"
      const parts = addrText.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        address = parts[0] || null;
        const cityStateZip = parts.slice(1).join(', ');
        const m = cityStateZip.match(/^([^,]+),\s*([A-Z]{2})\s*(\d{5})?/i);
        if (m) {
          city = m[1]?.trim() || null;
          state = m[2]?.trim().toUpperCase() || null;
          zip = m[3]?.trim() || null;
        } else {
          // fallback—just put the remainder in city
          city = cityStateZip || null;
        }
      } else {
        address = addrText;
      }
    }

    // Dates: leave raw; the index.js will store as text in `hours` if we can’t parse
    let start_date = null;
    let end_date = null;
    let hours = dateText || null;

    out.push({
      id: sourceId,
      title,
      address,
      city,
      state,
      zip,
      start_date,
      end_date,
      hours,
      url: href || null,
    });
  });

  return out.filter(x => x.title || x.address || x.city);
}

async function searchEstateSalesNet({ zip, radiusMi }) {
  const url = buildUrl({ zip, radiusMi });
  console.log('🔗 estatesales.net url:', url);

  try {
    const html = await fetchHtml(url);
    const rows = parseListings(html);
    console.log(`🔍 estatesales.net parsed ${rows.length} rows`);
    // Be nice if we need to page or fetch more
    await sleep(500);
    return rows;
  } catch (err) {
    console.error('estatesales.net fetch/parse error:', err?.message || err);
    return [];
  }
}

module.exports = { searchEstateSalesNet };
