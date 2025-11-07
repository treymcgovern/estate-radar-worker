// index.js — fetch real listings and upsert into Supabase

const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');
const { searchEstateSalesNet } = require('./sources/estatesalesnet');

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---- config for this run ----
const ZIP       = '93552';
const RADIUS_MI = 50;
const HOME_BASE = '36304 52nd St E, Palmdale, CA 93552';

// ---- helpers ---------------------------------------------------------------
async function logRun(status, notes) {
  try { await supabase.from('runs').insert({ status, notes }); } catch {}
}

function toTz(date) { return dayjs(date).toDate(); }

// ---- main -----------------------------------------------------------------
(async () => {
  console.log('--- Worker starting at', new Date().toISOString(), '---\n');

  console.log('Config:', {
    ZIP, RADIUS_MI, HOME_BASE
  });

  // Call the estatesales.net source in REAL mode
  const params = {
    zip: ZIP,
    radiusMi: RADIUS_MI,
    homeBase: HOME_BASE,
    maxPages: 10,
    fetchTimeoutMs: 20000,
    mock: false           // <<<<<< REAL DATA
  };

  console.log('[esm] params:', params);

  await logRun('running', 'started');

  const listings = await searchEstateSalesNet(params);
  console.log('[fetch] got', listings.length, 'listings');

  if (!Array.isArray(listings) || listings.length === 0) {
    await logRun('done', 'no listings');
    console.log('No listings. Exiting.');
    process.exit(0);
  }

  console.log('[upsert] preparing to upsert', listings.length, 'rows');

  // Minimal mapping; expects your `sales` table columns:
  // id (bigint identity), source, source_id, title, address, city, state, zip,
  // lat, lng, distance_mi (float), starts_at (timestamptz), ends_at (timestamptz),
  // directions_url (text), created_at (timestamptz, default now())
  const rows = listings.map((x) => ({
    source: 'estatesales.net',
    source_id: x.id,
    title: x.title,
    address: x.address,
    city: x.city,
    state: x.state,
    zip: x.zip,
    lat: x.lat ?? null,
    lng: x.lng ?? null,
    distance_mi: x.distance_mi ?? null,
    hours_json: x.hours_json ?? null, // keep if you had it before
    starts_at: x.starts_at ? toTz(x.starts_at) : null,
    ends_at:   x.ends_at   ? toTz(x.ends_at)   : null,
    directions_url: x.directions_url ?? null,
  }));

  // Upsert on (source, source_id) so we don’t duplicate
  const { error } = await supabase
    .from('sales')
    .upsert(rows, { onConflict: 'source,source_id' });

  if (error) {
    console.error('[upsert] error', error);
    await logRun('error', error.message ?? 'upsert error');
    process.exit(1);
  }

  console.log(`[upsert] inserted/updated ${rows.length} rows successfully`);
  await logRun('done', `upserted ${rows.length} rows`);
  console.log('Done.');
  process.exit(0);
})().catch(async (err) => {
  console.error('Fatal error:', err);
  await logRun('error', err.message ?? 'fatal');
  process.exit(1);
});
