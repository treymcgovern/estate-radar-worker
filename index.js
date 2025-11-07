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
const ZIP = '93552';
const RADIUS_MI = 50;
const HOME_BASE = '36304 52nd St E, Palmdale, CA 93552';

// ---- helpers -------------------------------------------------
async function logRun(status, notes) {
  try { await supabase.from('runs').insert({ status, notes }); } catch {}
}

// Upsert by natural key (title + address [+ start_at if present])
async function upsertSale(item) {
  // shape guard
  const payload = {
    title: item.title?.trim() || 'Untitled Estate Sale',
    address: item.address || '',
    city: item.city || null,
    start_at: item.start_at || null,
    end_at: item.end_at || null,
    hours_json: item.hours_json || null,
    distance_mi: item.distance_mi ?? null,
    directions_url: item.directions_url || null,
    source: item.source || 'estatesales.net',
  };

  // look for an existing row
  let q = supabase
    .from('sales')
    .select('id')
    .eq('title', payload.title)
    .eq('address', payload.address)
    .limit(1);

  if (payload.start_at) {
    q = q.eq('start_at', payload.start_at);
  }

  const { data: existing, error: selErr } = await q;
  if (selErr) throw selErr;

  if (existing && existing.length) {
    const id = existing[0].id;
    const { error } = await supabase.from('sales').update(payload).eq('id', id);
    if (error) throw error;
    return { action: 'update', id };
  } else {
    const { data, error } = await supabase.from('sales').insert(payload).select('id').limit(1);
    if (error) throw error;
    return { action: 'insert', id: data?.[0]?.id };
  }
}

// ---- main ----------------------------------------------------
async function main() {
  console.log('🚀 Worker starting (real fetch)…');
  await logRun('running', `ingest start zip=${ZIP} r=${RADIUS_MI}`);

  // 1) fetch from EstateSales.net (HTML parse)
  const items = await searchEstateSalesNet({
    zip: ZIP,
    radiusMiles: RADIUS_MI,
    pages: 2,
    homeBase: HOME_BASE,
  });

  // 2) write into Supabase
  let inserts = 0, updates = 0, errors = 0;
  for (const it of items) {
    try {
      const res = await upsertSale(it);
      if (res.action === 'insert') inserts++;
      else updates++;
    } catch (e) {
      errors++;
      console.error('upsert error:', e.message, it?.title);
    }
  }

  const summary = `done: ${items.length} fetched, ${inserts} inserted, ${updates} updated, ${errors} errors`;
  await logRun('success', summary);
  console.log('✅ Ingest complete —', summary);
}

main().catch(async (e) => {
  console.error('❌ Ingest failed:', e.message);
  await logRun('failed', e.message);
  process.exit(1);
});
