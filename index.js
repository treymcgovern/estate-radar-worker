const { createClient } = require('@supabase/supabase-js');
const dayjs = require('dayjs');

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const SUPABASE_URL = need('SUPABASE_URL');            // e.g. https://xxxx.supabase.co
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY'); // service role key (secret)

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('🚀 Worker starting...');

  // optional: log a run
  await supabase.from('runs').insert({ status: 'running', notes: 'local worker test' });

  // insert a simple test sale
  const start = dayjs().add(1, 'day').hour(9).minute(0).second(0).toISOString();
  const end   = dayjs(start).hour(15).toISOString();

  const { error } = await supabase.from('sales').insert({
    title: 'Railway Worker Test Sale',
    address: '456 Worker Ave, Palmdale, CA 93550',
    city: 'Palmdale',
    start_at: start,
    end_at: end,
    hours_json: { sat: '09:00–15:00' },
    distance_mi: 4.2,
    directions_url: 'https://www.google.com/maps/dir/36304+52nd+St+E,+Palmdale+CA/456+Worker+Ave,+Palmdale+CA'
  });

  if (error) throw error;
  console.log('✅ Test sale inserted successfully!');
}

main().catch((e) => {
  console.error('❌ Worker failed:', e.message);
  process.exit(1);
});
