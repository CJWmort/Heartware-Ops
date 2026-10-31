// Script that creates the admin (coordinator) account.
// HOW TO RUN (from the server folder). It needs an email and a password (min 8 characters):
//   PowerShell (Windows):
//     $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="at-least-8-chars"; pnpm run seed:admin
//   Git Bash / Mac / Linux:
//     ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='at-least-8-chars' pnpm run seed:admin
// Safe to repeat: running again with the same email resets that admin's password.

const bcrypt = require('bcrypt')
const mongoose = require('mongoose')
const { connect, disconnect } = require('./_connect')
require('../models/account-model')

// main() - creates or updates ONE admin account. 1) read ADMIN_EMAIL and ADMIN_PASSWORD (min 8
// characters) from the environment 2) connect 3) hash the password with bcrypt 4) upsert: always set
// password and role "admin"; only when creating, fill the other required fields with HQ placeholders
// 5) print the email and disconnect.
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
