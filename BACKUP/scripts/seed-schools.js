// Loads all MOE primary schools from data.gov.sg into the School collection.
// Owner: Kuah (F1a)          Run with:  npm run seed:schools
//
// Steps to implement:
// 1. Find the "General information of schools" dataset on https://data.gov.sg and copy its
//    resource id into config.env as SCHOOLS_RESOURCE_ID.
// 2. Fetch https://data.gov.sg/api/action/datastore_search?resource_id=<id>&limit=500
//    (built-in fetch). Keep rows where mainlevel_code === 'PRIMARY'.
// 3. For each school, geocode its postal_code with utils/onemap.js (add a small delay
//    between calls, e.g. 200 ms, to be polite to the API).
// 4. Upsert into School by name: { name, address, postalCode, zone: zone_code, location, p5Classes }.
//    p5Classes is NOT in the dataset – choose a rule (e.g. random 3–6, or ask Heartware) and
//    write it down in the README.
//
// Until this is done, `npm run seed:demo` loads data/mock-schools.json so everyone can work.

const { connect, disconnect } = require('./_connect')
// const { School } = require('../models')
// const { geocodePostalCode } = require('../utils/onemap')
// const { toPoint } = require('../utils/geo')

async function main() {
  await connect()

  // TODO(Kuah): steps 2–4 above
  console.log('seed-schools is not implemented yet – see the comments in this file.')

  await disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
