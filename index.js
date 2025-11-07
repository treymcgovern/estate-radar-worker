// index.js — fetch listings and upsert into Supabase (with loud logs)
console.log(">>> STARTING estate-radar-worker <<<");

const { createClient } = require("@supabase/supabase-js");
const dayjs = require("dayjs");
const { searchEstateSalesNet } = require("./sources/estatesalesnet");

// --- env helpers -------------------------------------------------------------
function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const SUPABASE_URL = need("SUPABASE_URL");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY"); // service role for server-side writes

// Admin client (server-side)
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// --- run configuration -------------------------------------------------------
const ZIP = "93552";
const RADIUS_MI = 50;
const HOME_BASE = "36304 52nd St E, Palmdale, CA 93552";

// --- tiny logger that writes to 'runs' table if available --------------------
async function logRun(status, notes) {
  try {
    await supabase.from("runs").insert({ status, notes });
  } catch (e) {
    // don't crash on log failures
  }
}

// --- upsert helper -----------------------------------------------------------
async function upsertSales(rows) {
  // Expect the 'sales' table to have columns like:
  // id (bigint identity), title text, address text, city text, state text,
  // created_at timestamptz default now(), hours_json jsonb, directions_url text, distance_mi float8
  // If you added a unique constraint, set onConflict to those columns.
  const { data, error } = await supabase
    .from("sales")
    .upsert(rows, { ignoreDuplicates: false }) // change to { onConflict: 'title,address' } if you add a constraint
    .select();

  if (error) throw error;
  return data ?? [];
}

// --- main --------------------------------------------------------------------
(async () => {
  const startTs = Date.now();
  console.log(
    `[${new Date().toISOString()}] Worker starting… ZIP=${ZIP} radius=${RADIUS_MI}mi`
  );

  try {
    // 1) Fetch listings (mock or real scraper inside sources/)
    const listings = await searchEstateSalesNet({
      zip: ZIP,
      radiusMi: RADIUS_MI,
      homeBase: HOME_BASE,
    });

    console.log(`Fetched ${listings.length} listing(s) from sources.`);

    if (!Array.isArray(listings) || listings.length === 0) {
      await logRun("ok", "No listings found.");
      console.log("No listings to upsert. Exiting.");
      process.exit(0);
      return;
    }

    // 2) Prepare rows for DB
    const rows = listings.map((x) => ({
      title: x.title,
      address: x.address,
      city: x.city,
      state: x.state,
      directions_url: x.directionsUrl,
      hours_json: x.hoursJson ?? null,
      distance_mi: x.distanceMi ?? null,
      // let created_at default to now() on the DB side
    }));

    // 3) Upsert
    const inserted = await upsertSales(rows);
    console.log(
      `Upsert complete: ${inserted.length} row(s). First:`,
      inserted[0] ? inserted[0].title : "(none)"
    );

    await logRun("ok", `Inserted ${inserted.length} row(s)`);
    console.log(
      `Done in ${Math.round((Date.now() - startTs) / 1000)}s — exiting.`
    );
    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err?.message || err);
    await logRun("error", String(err?.message || err));
    // Non-zero exit so Railway shows a red run if something blew up
    process.exit(1);
  }
})();
