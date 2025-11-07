// sources/estatesalesnet.js — very simple placeholder scraper with logging
// Replace this with your real implementation once the pipeline proves out.

const DEFAULT_HEADERS = {
  // Some sites require a UA; harmless to include for all
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'
};

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Return a few mock listings so we can verify the end-to-end pipeline.
 * When you’re ready, replace this with real HTTP fetch + parse.
 */
async function searchEstateSalesNet(opts) {
  const { zip, radiusMiles, homeBase, maxPages = 1, fetchTimeoutMs = 20000 } = opts || {};
  console.log('[esn] params:', { zip, radiusMiles, homeBase, maxPages, fetchTimeoutMs });

  // ---- If you already have real fetching/parsing, put it here. ------------
  // Example shape to return:
  // [
  //   {
  //     title: 'Huge Estate Sale — Palmdale',
  //     address: '456 Worker Ave',
  //     city: 'Palmdale',
  //     state: 'CA',
  //     zip: '93550',
  //     lat: 34.58,
  //     lng: -118.10,
  //     distanceMi: 4.2,
  //     hours: { sat: '09:00–15:00' },
  //     startsAt: '2025-11-08T17:00:00Z',
  //     endsAt:   '2025-11-08T23:00:00Z',
  //     directionsUrl: 'https://maps.google.com/?q=456 Worker Ave Palmdale CA',
  //     sourceId: 'esn-12345'
  //   }
  // ]

  // For now, return a short mock array each run so we can see upserts
  await sleep(500); // small delay to look more “real”
  const now = Date.now();
  const base = [
    {
      title: 'Railway Worker Test Sale',
      address: '456 Worker Ave',
      city: 'Palmdale',
      state: 'CA',
      zip: '93550',
      lat: 34.58,
      lng: -118.10,
      distanceMi: 4.2,
      hours: { sat: '09:00–15:00' },
      startsAt: new Date(now + 24 * 3600 * 1000).toISOString(),
      endsAt:   new Date(now + 24 * 3600 * 1000 + 6 * 3600 * 1000).toISOString(),
      directionsUrl: 'https://www.google.com/maps?q=456+Worker+Ave,+Palmdale,+CA+93550',
      sourceId: 'esn-mock-001'
    },
    {
      title: 'Railway Worker Test Sale 2',
      address: '456 Worker Ave',
      city: 'Palmdale',
      state: 'CA',
      zip: '93550',
      lat: 34.58,
      lng: -118.10,
      distanceMi: 4.2,
      hours: { sat: '09:00–15:00' },
      startsAt: new Date(now + 48 * 3600 * 1000).toISOString(),
      endsAt:   new Date(now + 48 * 3600 * 1000 + 6 * 3600 * 1000).toISOString(),
      directionsUrl: 'https://www.google.com/maps?q=456+Worker+Ave,+Palmdale,+CA+93550',
      sourceId: 'esn-mock-002'
    }
  ];

  console.log(`[esn] returning ${base.length} mock listings`);
  return base;
}

module.exports = { searchEstateSalesNet };
