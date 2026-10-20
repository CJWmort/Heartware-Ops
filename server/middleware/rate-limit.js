// NEW (security): a tiny "too many requests" guard. No extra package needed.
//
// Why: login, "send me a code" and the OneMap lookups are open to anyone on the internet.
// Without a limit, someone can guess passwords all day, make us email codes to strangers, or use up our OneMap quota.
//
// How it works: for each caller (their IP address) we count requests inside a time window.
// Over the limit -> answer 429 "Too many requests" until the window ends.
// Counts are kept in server memory, so they reset when the server restarts (fine for this project).
//
// Use:  router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), handler)

module.exports = function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // caller -> { count, resetAt }

  // Every minute, forget callers whose window is over, so the Map cannot grow forever
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, 60 * 1000).unref(); // unref() = this timer alone never keeps the server process alive

  return (req, res, next) => {
    const key = req.ip; // behind a host's proxy this is the real visitor, because server.js sets "trust proxy" in production
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }; // start a fresh window
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      // Retry-After tells the browser (and curious humans) how many seconds to wait
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message: message || 'Too many requests. Please wait a few minutes and try again.' });
    }
    next();
  };
};
