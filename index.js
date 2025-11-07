// index.js — verbose run with strong logging around fetch + insert

const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');
const { searchEstateSalesNet } = require('./sources/estatesalesnet');

// ---------- env helpers ----------
function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY');
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

// ---------- config ----------
const ZIP       = '93552';
const RADIUS_MI = 50;
const HOME_BASE = '36304 52nd St E, Palmdale, CA 93552';

// ---------- helpers ----------
async function logRun(status, notes) {
  try {
    await supabase.from('runs').insert({ status, notes });
  } catch (e) {
    console.error('[runs] log insert failed:', e.message);
  }
}

function safeRowFromListing(x) {
  // normalize/guard every field we write
  return {
    title:       x.title ?? null,
    address:     x.address ?? null,
    city:        x.city ?? null,
    state:       x.state ?? null,
    zip:         x.zip ?? null,
    lat:         typeof x.lat === 'number' ? x.lat : null,
    lng:         typeof x.lng === 'number' ? x.lng : null,
    start_at:    x.start_at ? new Date(x.start_at).toISOString() : null,
    ends_at:     x.ends_at ? new Date(x.ends_at).toISOString() : null,
    hours_json:  x.hours ? JSON.stringify(x.hours) : JSON.stringify({}),
    distance_mi: typeof x.distance_mi === 'number' ? x.distance_mi : null,
    directions_url: x.directions_url ?? null,
    source: 'estatesales.net', // explicit — matches the new column
  };
}

async function upsertSales(rows) {
  if (!rows.length) return { count: 0 };
  // Start with plain insert; we can move to upsert with a unique index later.
  const { error } = await supabase.from('sales').insert(rows);
  if (error) throw error;
  return { count: rows.length };
}

// ---------- main ----------
(async function main() {
  const startedAt = new Date().toISOString();
  console.log('=== Worker starting at', startedAt, '===');
  console.log('Config:', { ZIP, RADIUS_MI, HOME_BASE });

  await logRun('running', 'started');

  try {
    const params = {
      zip: ZIP,
      radiusMiles: RADIUS_MI,
      homebase: HOME_BASE,
      maxPages: 1,         // keep small while we verify writes
      fetchAmountMs: 2000, // pacing for remote requests
    };
    console.log('[esm] params:', params);

    const listings = await searchEstateSalesNet(params);
    console.log('[fetch] got', listings.length, 'listings');

    const rows = listings.map(safeRowFromListing);
    console.log('[prepare] first row sample:', rows[0]);

    const { count } = await upsertSales(rows);
    console.log(`[insert] inserted ${count} rows`);

    await logRun('success', `inserted ${count} rows`);
    console.log('=== Worker finished OK ===');
  } catch (err) {
    console.error('[ERROR]', err.message);
    await logRun('error', err.message?.slice(0, 255) ?? 'error');
    console.log('=== Worker finished WITH ERROR ===');
    process.exitCode = 1;
  }
})();
