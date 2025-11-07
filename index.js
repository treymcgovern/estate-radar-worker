// index.js — CANARY PROBE: prove runtime + env + DB writes

// 1) Loud boot + env presence (no secrets logged)
console.log('=== CANARY BOOT ===', new Date().toISOString());
const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
};
const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY');
console.log('[env] seen at runtime =>', {
  SUPABASE_URL: !!process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
});

// 2) Supabase client
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 3) Helpers
async function logRun(status, notes) {
  try {
    const { error } = await supabase.from('runs').insert({ status, notes });
    if (error) throw error;
    console.log('[runs] insert ok:', { status, notes });
  } catch (e) {
    console.error('[runs] insert FAILED:', e.message || e);
    throw e;
  }
}

async function insertCanarySale() {
  const row = {
    title: 'CANARY Probe — Estate Radar Worker',
    address: '36304 52nd St E, Palmdale, CA 93552',
    city: 'Palmdale',
    state: 'CA',
    source: 'canary',
    directions_url: 'https://maps.google.com/?q=36304+52nd+St+E,+Palmdale,+CA+93552',
    hours_json: JSON.stringify({ note: 'this is a canary insert' }),
  };
  const { error } = await supabase.from('sales').insert(row);
  if (error) throw error;
  console.log('[sales] CANARY insert ok');
}

// 4) Main
(async () => {
  try {
    console.log('[db] ping runs…');
    await supabase.from('runs').select('id').limit(1);
    console.log('[db] ping ok');

    // write a canary row to runs
    await logRun('canary', 'worker reached runtime and can write');

    // write a canary row to sales
    await insertCanarySale();

    console.log('=== CANARY DONE OK ===');
    process.exit(0);
  } catch (err) {
    console.error('=== CANARY FAILED ===', err?.message || err);
    // best-effort run log (don’t rethrow inside)
    try { await logRun('canary_error', err?.message || String(err)); } catch {}
    process.exit(1);
  }
})();
