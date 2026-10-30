// Email one-time codes: create, send (or mock), check and remember the verified email.

const crypto = require('crypto')

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_SECONDS = 60
const MAX_ATTEMPTS = 5
const VERIFIED_TTL_MS = 15 * 60 * 1000

const codes = new Map()
const verified = new Map()

// hash(code) - one-way SHA-256 fingerprint of a code, so the real code is never stored.
const hash = (code) => crypto.createHash('sha256').update(code).digest('hex')
// clean(email) - trims and lowercases an email so "A@b.com " and "a@b.com" count as the same address.
const clean = (email) => String(email || '').trim().toLowerCase()

// isMockMode() - true when OTP_MOCK=true, or when there is no Brevo key and the server is NOT in
// production. Test mode prints the code instead of emailing it.
const isMockMode = () =>
  process.env.OTP_MOCK === 'true' ||
  (!process.env.BREVO_API_KEY && process.env.NODE_ENV !== 'production')

// sendWithBrevo(email, code) - emails the code. 1) POST to Brevo's API with the API key, sender and
// recipient 2) the message contains the code and "expires in 10 minutes" 3) a non-OK reply throws an
// error that includes Brevo's explanation.
async function sendWithBrevo(email, code) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL,
        name: process.env.BREVO_SENDER_NAME || 'Heartware Ops',
      },
      to: [{ email }],
      subject: `Your Heartware Ops code: ${code}`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;font-size:16px;color:#1f2430">
          <p>Hi,</p>
          <p>Your code to finish signing up as a Heartware volunteer is:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#d6001c">${code}</p>
          <p>It expires in 10 minutes. If you did not sign up, you can ignore this email.</p>
        </div>`,
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Brevo could not send the email (${response.status}): ${details}`)
  }
}

// requestCode(rawEmail) - makes and sends a code. 1) clean the email 2) if a code was sent less than
// 60 seconds ago throw a 429 error 3) generate a random 6-digit code (crypto.randomInt, zero-padded)
// 4) test mode: print it; otherwise require BREVO_API_KEY and email it 5) remember only the HASH with
// expiry (10 min), attempts = 0 and send time 6) forget any earlier verified status 7) return {
// resendInSeconds, devCode? } (devCode only in test mode).
async function requestCode(rawEmail) {
  const email = clean(rawEmail)
  const existing = codes.get(email)

  if (existing) {
    const secondsSinceLast = (Date.now() - existing.sentAt) / 1000
    if (secondsSinceLast < RESEND_SECONDS) {
      const wait = Math.ceil(RESEND_SECONDS - secondsSinceLast)
      const error = new Error(`Please wait ${wait}s before asking for another code.`)
      error.status = 429
      throw error
    }
  }

  const code = String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')

  if (isMockMode()) {
    console.log(`[OTP test mode] code for ${email}: ${code}`)
  } else {
    if (!process.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY is not set on the server.')
    await sendWithBrevo(email, code)
  }

  codes.set(email, { hash: hash(code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, sentAt: Date.now() })
  verified.delete(email)

  return { resendInSeconds: RESEND_SECONDS, ...(isMockMode() ? { devCode: code } : {}) }
}

// checkCode(rawEmail, rawCode) - checks what the volunteer typed. Returns "" when right, otherwise a
// message. 1) no code requested -> message 2) expired -> delete it and say so 3) 5 wrong tries already
// -> message 4) wrong -> add 1 to attempts and say how many tries are left 5) right -> delete the code
// (cannot be reused) and mark the email verified for 15 minutes.
function checkCode(rawEmail, rawCode) {
  const email = clean(rawEmail)
  const code = String(rawCode || '').trim()
  const entry = codes.get(email)

  if (!entry) return 'Please request a code first.'
  if (Date.now() > entry.expiresAt) {
    codes.delete(email)
    return 'This code has expired. Press "Resend code" for a new one.'
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    return 'Too many wrong tries. Press "Resend code" for a new one.'
  }
  if (hash(code) !== entry.hash) {
    entry.attempts += 1
    const left = MAX_ATTEMPTS - entry.attempts
    return left > 0
      ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
      : 'Too many wrong tries. Press "Resend code" for a new one.'
  }

  codes.delete(email)
  verified.set(email, Date.now() + VERIFIED_TTL_MS)
  return ''
}

// useVerifiedEmail(rawEmail) - consumes the verification when the account is created. 1) read and
// DELETE the saved expiry 2) true only if it existed and has not expired.
function useVerifiedEmail(rawEmail) {
  const email = clean(rawEmail)
  const expiresAt = verified.get(email)
  verified.delete(email)
  return Boolean(expiresAt && Date.now() <= expiresAt)
}

// isVerifiedEmail(rawEmail) - same check as useVerifiedEmail but only LOOKS (does not delete), so a
// failed sign-up can be retried without a new code.
function isVerifiedEmail(rawEmail) {
  const expiresAt = verified.get(clean(rawEmail))
  return Boolean(expiresAt && Date.now() <= expiresAt)
}

module.exports = { requestCode, checkCode, useVerifiedEmail, isVerifiedEmail, CODE_LENGTH }