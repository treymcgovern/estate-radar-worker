// index.js — fetch real listings and upsert into Supabase (with verbose logging)

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
  try {
    await supabase.from('runs').insert({ status, notes });
  } catch (err) {
    console.error('[runs] insert failed:', err.message);
  }
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

// ---- main ------------------------------------------------------------------
(async () => {
  console.log('=== Worker starting at', new Date().toISOString(), '===');
  console.log('Config:', { ZIP, RADIUS_MI, HOME_BASE });

  await logRun('starting', `zip=${ZIP}, radius=${RADIUS_MI}`);

  let results;
  try {
    results = await searchEstateSalesNet({
      zip: ZIP,
      radiusMiles: RADIUS_MI,
      homeBase: HOME_BASE,
      maxPages: 1,          // you can bump this later
      fetchTimeoutMs: 20000 // safety timeout
    });
  } catch (err) {
    console.error('[fetch] failed:', err.stack || err.message || err);
    await logRun('error', `fetch failed: ${err.message}`);
    process.exit(1);
  }

  if (!results || !Array.isArray(results) || results.length === 0) {
    console.warn('[fetch] no listings returned');
    await logRun('done', '0 listings (no-op)');
    console.log('=== Worker done (no data) ===');
    process.exit(0);
  }

  console.log(`[fetch] got ${results.length} raw listings`);
  // Normalize rows for Supabase
  const rows = results.map((r) => {
    return {
      title: r.title || null,
      address: r.address || null,
      city: r.city || null,
      state: r.state || null,
      zip: r.zip || null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      distance_mi: r.distanceMi ?? null,
      hours_json: r.hours ? JSON.stringify(r.hours) : null,
      starts_at: r.startsAt ? new Date(r.startsAt).toISOString() : null,
      ends_at: r.endsAt ? new Date(r.endsAt).toISOString() : null,
      directions_url: r.directionsUrl || null,
      source: 'estatesales.net',
      source_id: r.sourceId || null,
      created_at: new Date().toISOString()
    };
  });

  console.log(`[upsert] preparing to upsert ${rows.length} rows`);
  // Show a small sample to verify shape
  console.log('[upsert] sample row:', pretty(rows[0]));

  try {
    // upsert on (source, source_id) to avoid duplicates
    const { error } = await supabase
      .from('sales')
      .upsert(rows, { onConflict: 'source,source_id' });

    if (error) throw error;

    console.log('[upsert] success');
    await logRun('done', `upserted=${rows.length}`);
    console.log('=== Worker done OK ===');
    process.exit(0);
  } catch (err) {
    console.error('[upsert] failed:', err.stack || err.message || err);
    await logRun('error', `upsert failed: ${err.message}`);
    process.exit(1);
  }
})();
