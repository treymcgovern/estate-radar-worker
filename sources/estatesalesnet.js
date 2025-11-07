// sources/estatesalesnet.js
// For now, return a couple of realistic mock listings so we can prove end-to-end flow.
// Replace this later with real scraping/API logic and keep the same shape.

const dayjs = require("dayjs");

function mkGmapsDirections(address) {
  // basic directions URL
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address
  )}`;
}

async function searchEstateSalesNet({ zip, radiusMi, homeBase }) {
  // Simulated “found” listings near Palmdale; tweak as needed
  const sample = [
    {
      title: "Railway Worker Test Sale",
      address: "456 Worker Ave, Palmdale, CA 93550",
      city: "Palmdale",
      state: "CA",
      hoursJson: { sat: "09:00–15:00" },
      directionsUrl: mkGmapsDirections("456 Worker Ave, Palmdale, CA 93550"),
      distanceMi: 4.2,
    },
    {
      title: "Pearblossom Estate — Vintage & Antiques",
      address: "22116 Ave V-10, Pearblossom, CA 93553",
      city: "Pearblossom",
      state: "CA",
      hoursJson: { sat: "09:00–16:00" },
      directionsUrl: mkGmapsDirections("22116 Ave V-10, Pearblossom, CA 93553"),
      distanceMi: 17.8,
    },
  ];

  // Add a timestamp to prove each run is “new” data on the console,
  // while letting DB default created_at for actual row time.
  console.log(
    `[sources/estatesalesnet] returning ${sample.length} rows @ ${dayjs().format()}`
  );

  return sample;
}

module.exports = { searchEstateSalesNet };
