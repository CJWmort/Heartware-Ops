// Email OTP (one-time code) for registration – Owner: Kuah (F1a)
// 1. requestCode(email) makes a 6-digit code, remembers it, and emails it with Brevo
// 2. checkCode(email, code) checks what the volunteer typed
// 3. useVerifiedEmail(email) is called when the account is created, so nobody can skip step 2
//
// Codes are kept in server memory (a Map). That's fine for this project:
// if the server restarts, the volunteer just presses "Resend code".

const crypto = require('crypto')

const CODE_LENGTH = 6
const CODE_TTL_MS = 10 * 60 * 1000 // a code works for 10 minutes
const RESEND_SECONDS = 60 // wait 60 s before asking for another code
const MAX_ATTEMPTS = 5 // 5 wrong tries -> must request a new code
const VERIFIED_TTL_MS = 15 * 60 * 1000 // after verifying, 15 min to finish creating the account

const codes = new Map() // email -> { hash, expiresAt, attempts, sentAt }
const verified = new Map() // email -> expiresAt

// Never store the code itself, only a hash of it (like passwords)
const hash = (code) => crypto.createHash('sha256').update(code).digest('hex')
const clean = (email) => String(email || '').trim().toLowerCase()

// Test mode: no email is sent, the code is returned to the page instead.
// On when OTP_MOCK=true, or when no Brevo key is set yet.
const isMockMode = () => process.env.OTP_MOCK === 'true' || !process.env.BREVO_API_KEY

// Send the email through Brevo's API (https://developers.brevo.com/reference/sendtransacemail)
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

// Returns { resendInSeconds, devCode? }   devCode is only included in test mode
async function requestCode(rawEmail) {
  const email = clean(rawEmail)
  const existing = codes.get(email)

  // Stop people spamming "Resend"
  if (existing) {
    const secondsSinceLast = (Date.now() - existing.sentAt) / 1000
    if (secondsSinceLast < RESEND_SECONDS) {
      const wait = Math.ceil(RESEND_SECONDS - secondsSinceLast)
      const error = new Error(`Please wait ${wait}s before asking for another code.`)
      error.status = 429
      throw error
    }
  }

  // Random 6-digit code, e.g. "048213" (crypto = properly random)
  const code = String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')

  if (isMockMode()) {
    console.log(`[OTP test mode] code for ${email}: ${code}`)
  } else {
    await sendWithBrevo(email, code)
  }

  codes.set(email, { hash: hash(code), expiresAt: Date.now() + CODE_TTL_MS, attempts: 0, sentAt: Date.now() })
  verified.delete(email)

  return { resendInSeconds: RESEND_SECONDS, ...(isMockMode() ? { devCode: code } : {}) }
}

// Returns '' if the code is right, otherwise an error message
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

  // Correct: the code can't be used again, and the email is marked as verified
  codes.delete(email)
  verified.set(email, Date.now() + VERIFIED_TTL_MS)
  return ''
}

// Used when creating the account. true = email was verified (and it's used up now)
function useVerifiedEmail(rawEmail) {
  const email = clean(rawEmail)
  const expiresAt = verified.get(email)
  verified.delete(email)
  return Boolean(expiresAt && Date.now() <= expiresAt)
}

module.exports = { requestCode, checkCode, useVerifiedEmail, CODE_LENGTH }