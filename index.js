// index.js — fetch real listings and upsert into Supabase (with robust logging)

const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');
const { searchEstateSalesNet } = require('./sources/estatesalesnet');

// --- tiny env helper ---------------------------------------------------------
function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// --- Supabase client ----------------------------------------------------------
const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY');
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

// --- run config ---------------------------------------------------------------
const ZIP       = process.env.ZIP || '93552';
const RADIUS_MI = Number(process.env.RADIUS_MI || 50);
const HOME_BASE = process.env.HOME_BASE || '36304 52nd St E, Palmdale, CA 93552';

// how far back to fetch (mins) + page limit to avoid over-scraping while testing
const fetchMinutes = Number(process.env.FETCH_MINUTES || 120);
const maxPages     = Number(process.env.MAX_PAGES || 2);

// upsert conflict target must match your unique index on sales:
// CREATE UNIQUE INDEX sales_unique_idx ON public.sales (title, address, start_at);
const conflictTarget = ['title', 'address', 'start_at'];

// --- helper to log a run into public.runs ------------------------------------
// (create table public.runs(id bigserial pk, created_at timestamptz default now(),
//  status text, notes text, found int, inserted int))
async function logRun({ status, notes, found = 0, inserted = 0 }) {
  try {
    await supabase.from('runs').insert({ status, notes, found, inserted });
  } catch (e) {
    console.error('[runs] insert error:', e?.message || e);
  }
}

// --- main ---------------------------------------------------------------------
(async function main() {
  const startedAt = dayjs().toISOString();
  console.log(`\n=== Worker starting at ${startedAt} ===`);
  console.log('Config:', {
    ZIP, RADIUS_MI, HOME_BASE,
    fetchMinutes, maxPages
  });

  try {
    console.log('[fetch] calling estatesales.net...');
    const listings = await searchEstateSalesNet({
      zip: ZIP,
      radiusMiles: RADIUS_MI,
      homebase: HOME_BASE,
      maxPages,
      fetchMinutes
    });

    const found = Array.isArray(listings) ? listings.length : 0;
    console.log(`[fetch] got ${found} listing(s)`);

    if (!found) {
      await logRun({ status: 'ok:0', notes: 'No listings found', found, inserted: 0 });
      console.log('[done] No listings — exiting.');
      return;
    }

    // preview first row to verify shapes
    console.log('[sample row]', JSON.stringify(listings[0], null, 2));

    // sanitize rows to match your schema exactly
    const rows = listings.map(l => ({
      title:       l.title ?? null,
      address:     l.address ?? null,
      city:        l.city ?? null,
      state:       l.state ?? 'CA',
      zip:         l.zip ?? ZIP,
      lat:         l.lat ?? null,
      lng:         l.lng ?? null,
      distance_mi: l.distance_mi ?? null,
      start_at:    l.start_at ? dayjs(l.start_at).toISOString() : null,
      ends_at:     l.ends_at   ? dayjs(l.ends_at).toISOString()   : null,
      hours_json:  l.hours_json ?? null,     // jsonb column
      directions_url: l.directions_url ?? null,
      created_at:  l.created_at ? dayjs(l.created_at).toISOString() : dayjs().toISOString(),
      // Optional: keep a source tag so we can filter later
      source: 'estatesales.net'
    }));

    console.log('[upsert] preparing', rows.length, 'rows');

    // upsert and ask Supabase to return count
    const { data, error, status, statusText, count } =
      await supabase
        .from('sales')
        .upsert(rows, { onConflict: conflictTarget.join(','), ignoreDuplicates: false })
        .select('id', { count: 'exact' });

    if (error) {
      console.error('[upsert] error:', status, statusText, error.message);
      await logRun({ status: 'error', notes: `upsert: ${error.message}`, found, inserted: 0 });
      process.exitCode = 1;
      return;
    }

    // "count" is the number of rows returned by select; not strictly "inserted".
    // To estimate inserts, compare how many had no id before; as a simple signal we log count.
    const insertedApprox = count ?? (data ? data.length : 0);
    console.log(`[upsert] ok. returned rows: ${insertedApprox}`);

    await logRun({
      status: 'ok',
      notes: `upsert ok: returned=${insertedApprox}`,
      found,
      inserted: insertedApprox
    });

    console.log('[done] Success.');
  } catch (err) {
    console.error('[fatal] ', err?.message || err);
    await logRun({ status: 'fatal', notes: String(err?.message || err), found: 0, inserted: 0 });
    process.exitCode = 1;
  }
})();
