// index.js — fetch real listings and upsert into Supabase (with strong logging)

const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');
const { searchEstateSalesNet } = require('./sources/estatesalesnet');

// --- small helper to require envs clearly ---
function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// --- env + supabase client (service key) ---
const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// --- run config ---
const ZIP = '93552';
const RADIUS_MI = 50;
const HOME_BASE = '36304 52nd St E, Palmdale, CA 93552';

// --- small logging helpers ---
async function logRun(status, notes) {
  try {
    await supabase.from('runs').insert({ status, notes });
  } catch (_) {}
}
function log(...args) {
  console.log(...args);
}

// --- upsert into sales table ---
async function upsertSales(rows) {
  if (!Array.isArray(rows)) rows = [];
  if (!rows.length) return { inserted: 0, updated: 0 };

  // Map inbound rows to our table shape. Accepted fields:
  // source, source_id, title, address, city, state, zip, start_date, end_date, hours, lat, lng
  const mapped = rows.map(r => ({
    source: 'estatesales.net',
    source_id: r.id || r.source_id || null,
    title: r.title || '(no title)',
    address: r.address || null,
    city: r.city || null,
    state: r.state || 'CA',
    zip: r.zip || null,
    start_date: r.start_date ? new Date(r.start_date) : null,
    end_date: r.end_date ? new Date(r.end_date) : null,
    hours: r.hours || null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
  }));

  // Upsert on (source, source_id) so we don’t duplicate the same listing
  const { data, error, status } = await supabase
    .from('sales')
    .upsert(mapped, { onConflict: 'source,source_id' })
    .select();

  if (error) throw error;

  // Heuristic for inserted/updated counts (PostgREST doesn’t separate them for upsert)
  const affected = Array.isArray(data) ? data.length : 0;
  return { inserted: affected, updated: 0, status };
}

// --- main ---
(async () => {
  const startedAt = new Date();
  log('🚀 Worker starting (real fetch)…');
  log(`📍 Home base: ${HOME_BASE}`);
  log(`🔎 ZIP: ${ZIP}  Radius: ${RADIUS_MI} mi`);

  try {
    log('🌐 Fetching listings from estatesales.net…');
    const results = await searchEstateSalesNet({ zip: ZIP, radiusMi: RADIUS_MI });

    const n = Array.isArray(results) ? results.length : 0;
    log(`📦 Fetched ${n} listings`);

    if (!n) {
      await logRun('ok', `no_results: ${ZIP} within ${RADIUS_MI}mi`);
      log('ℹ️ No results to upsert. Exiting cleanly.');
      return;
    }

    log('📝 Upserting into Supabase…');
    const { inserted, updated } = await upsertSales(results);

    const doneNote = `inserted=${inserted}, updated=${updated}`;
    await logRun('ok', doneNote);

    const ms = Date.now() - startedAt.getTime();
    log(`✅ Ingest complete — ${doneNote}  (${ms}ms)`);
  } catch (err) {
    const msg = err?.message || String(err);
    await logRun('error', msg);
    console.error('❌ Worker error:', err);
    process.exitCode = 1;
  }
})();
