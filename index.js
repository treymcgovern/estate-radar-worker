// index.js — fetch real listings and upsert into Supabase (debug build)

// ---- loud global error handlers -------------------------------------------
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled Promise rejection:', err && err.stack || err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err && err.stack || err);
  process.exit(1);
});

console.log('== Worker booting ==', new Date().toISOString());

const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');
const { searchEstateSalesNet } = require('./sources/estatesalesnet');

// ---- env helpers -----------------------------------------------------------
function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[ENV] Missing env var: ${name}`);
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

// ---- config/env ------------------------------------------------------------
const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// run configuration
const ZIP       = '93552';
const RADIUS_MI = 50;
const HOME_BASE = '36304 52nd St E, Palmdale, CA 93552';

// ---- db helpers ------------------------------------------------------------
async function logRun(status, notes) {
  try {
    await supabase.from('runs').insert({
      status,
      notes,
      started_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[runs] insert failed:', e);
  }
}

// ---- main ------------------------------------------------------------------
(async function main() {
  console.log('[main] starting run…');
  const startedAt = Date.now();

  try {
    // sanity check DB connectivity
    console.log('[db] ping: selecting 1 from runs…');
    await supabase.from('runs').select('id').limit(1);
    console.log('[db] ping ok.');

    // fetch from estatesales.net (scraper/source module)
    console.log('[fetch] estatesales.net search starting…', { ZIP, RADIUS_MI });
    const sales = await searchEstateSalesNet({
      zip: ZIP,
      radiusMi: RADIUS_MI,
      homeBase: HOME_BASE
    });

    const count = Array.isArray(sales) ? sales.length : 0;
    console.log(`[fetch] got ${count} sales.`);

    if (!Array.isArray(sales)) {
      throw new Error('searchEstateSalesNet returned non-array result');
    }

    if (sales.length === 0) {
      console.warn('[fetch] no results; logging run and exiting.');
      await logRun('ok', '0 results');
      console.log('== Worker done (no results) ==', (Date.now() - startedAt) + 'ms');
      return;
    }

    // upsert into Supabase
    console.log('[upsert] writing to supabase…');
    const { error } = await supabase
      .from('sales')
      .upsert(sales, { onConflict: 'id' }); // assumes 'id' is unique key in your table
    if (error) {
      console.error('[upsert] error:', error);
      throw error;
    }

    await logRun('ok', `inserted/upserted ${sales.length}`);
    console.log('[upsert] done.');
    console.log('== Worker done (success) ==', (Date.now() - startedAt) + 'ms');
  } catch (err) {
    console.error('[main] FAILED:', err && err.stack || err);
    await logRun('error', String(err && err.message || err));
    process.exit(1);
  }
})();
