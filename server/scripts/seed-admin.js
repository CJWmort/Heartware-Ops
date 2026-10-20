// Creates (or resets the password of) ONE admin account, because public sign-up only makes volunteers.
// Run with:  ADMIN_EMAIL=admin@heartware.sg ADMIN_PASSWORD='ChangeMe123!' npm run seed:admin
// (On Windows PowerShell:  $env:ADMIN_EMAIL="..."; $env:ADMIN_PASSWORD="..."; npm run seed:admin)
const bcrypt = require('bcrypt')
const mongoose = require('mongoose')
const { connect, disconnect } = require('./_connect')
require('../models/account-model')

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ''
  if (!email || password.length < 8) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters).')
    process.exit(1)
  }

  await connect()
  const Account = mongoose.model('Account')
  const hashed = await bcrypt.hash(password, 10)

  await Account.updateOne(
    { email },
    {
      $set: { password: hashed, role: 'admin' },
      // only used the first time the account is created (fields the schema requires)
      $setOnInsert: {
        name: 'Heartware Admin',
        postalCode: '238823',
        address: 'Heartware HQ',
        phone: '60000000',
        lat: 1.3048,
        lng: 103.8318,
        availableShows: [],
      },
    },
    { upsert: true }
  )
  console.log(`Admin ready: ${email}`)
  await disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
