// sources/estatesalesnet.js
// Lightweight HTML scraper for EstateSales.net search results near a ZIP.
// Uses cheerio to parse, p-limit to throttle requests.

const cheerio = require('cheerio');
const pLimit = require('p-limit');
const dayjs = require('dayjs');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseDateRange(raw = '') {
  // Examples: "Fri Nov 7 – Sat Nov 8", "Nov 9", "Nov 9–10"
  // We return ISO start and end (best-effort, upcoming week bias)
  try {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    // naive split by – or -
    const parts = cleaned.split(/[–-]/).map((s) => s.trim());
    if (parts.length === 1) {
      const d = dayjs(parts[0], ['ddd MMM D', 'MMM D'], true);
      if (d.isValid()) {
        const start = d.hour(9).minute(0).second(0);
        const end = start.hour(15);
        return { start_at: start.toISOString(), end_at: end.toISOString() };
      }
    } else {
      const d1 = dayjs(parts[0], ['ddd MMM D', 'MMM D'], true);
      const d2 = dayjs(parts[1], ['ddd MMM D', 'MMM D'], true);
      if (d1.isValid() && d2.isValid()) {
        const start = d1.hour(9);
        const end = d2.hour(15);
        return { start_at: start.toISOString(), end_at: end.toISOString() };
      }
    }
  } catch {}
  return { start_at: null, end_at: null };
}

function parseHours(raw = '') {
  // Examples: "9am–3pm", "10:00–2:00"
  const m = raw.match(/(\d{1,2}(:\d{2})?\s*(am|pm)?)\s*[–-]\s*(\d{1,2}(:\d{2})?\s*(am|pm)?)/i);
  if (!m) return null;
  return { generic: m[0] };
}

function isHomeLocation(textBlob = '') {
  const t = textBlob.toLowerCase();
  const bad = [
    'store hours',
    'retail store',
    'warehouse',
    'storage unit',
    'showroom',
    'consignment',
    'off-site',
    'off site',
    'by appointment only',
  ];
  if (bad.some((k) => t.includes(k))) return false;
  return true; // default allow
}

function cityFromAddress(addr = '') {
  // naive: split by comma and take second piece
  const parts = addr.split(',');
  if (parts.length >= 2) return parts[parts.length - 2].trim();
  return null;
}

function buildDirections(homeBase, address) {
  const enc = (s) => encodeURIComponent(s);
  return `https://www.google.com/maps/dir/${enc(homeBase)}/${enc(address)}`;
}

async function fetchPage({ zip, radiusMiles, page = 1 }) {
  const url = `https://www.estatesales.net/estate-sales/${zip}?radius=${radiusMiles}&page=${page}`;
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  const html = await res.text();
  return html;
}

function parseList(html, { homeBase }) {
  const $ = cheerio.load(html);
  const out = [];

  // Try to select “card” like containers; selectors may vary; we use flexible guesses
  const cards = $('article, .sale, .card, .result, li').filter((i, el) => {
    const text = $(el).text().trim();
    return /estate sale/i.test(text) || /address/i.test(text) || /directions/i.test(text);
  });

  cards.each((_, el) => {
    const root = $(el);

    // Title
    const title =
      root.find('h2, h3, .title, .sale-title, a[title]').first().text().trim() ||
      root.find('a').first().text().trim();

    // Address (ES.net often hides street until morning of sale; we grab city/state if shown)
    let address =
      root.find('.address, .sale-address, address').first().text().trim() ||
      root.find(':contains("Address")').next().text().trim();

    // Dates/hours text heuristics
    const when =
      root.find('.dates, .sale-dates, .when, time').first().text().trim() ||
      root.find(':contains("Date")').next().text().trim();

    const hoursTxt =
      root.find(':contains("Hours")').next().text().trim() ||
      root.find('.hours, .time-range').first().text().trim();

    // Skip if no meaningful content
    const blob = root.text().trim();
    if (!title || !blob) return;

    // Filter to likely home-location
    if (!isHomeLocation(blob)) return;

    const { start_at, end_at } = parseDateRange(when);
    const hours_json = hoursTxt ? { generic: hoursTxt } : null;
    const city = cityFromAddress(address) || null;

    // Directions link (works even if only city present)
    const directions_url = address ? buildDirections(homeBase, address) : null;

    out.push({
      title,
      address: address || '',
      city,
      start_at,
      end_at,
      hours_json,
      distance_mi: null, // we’ll let frontend compute or add later with a geocoder
      directions_url,
      source: 'estatesales.net',
    });
  });

  return out;
}

async function searchEstateSalesNet({ zip, radiusMiles = 50, pages = 2, homeBase }) {
  const limit = pLimit(1); // be polite
  const htmlPages = [];
  for (let p = 1; p <= pages; p++) {
    htmlPages.push(
      limit(async () => {
        await sleep(500);
        return fetchPage({ zip, radiusMiles, page: p });
      })
    );
  }
  const results = [];
  const pagesHtml = await Promise.all(htmlPages);
  for (const html of pagesHtml) {
    results.push(...parseList(html, { homeBase }));
  }
  // Basic de-dupe by title+address
  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.title}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { searchEstateSalesNet };
