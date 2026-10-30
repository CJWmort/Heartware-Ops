// Limits how many requests one IP can send in a time window, to slow down spam and guessing.

// rateLimit({ windowMs, max, message }) - builds a "too many requests" gate. Each call makes its OWN
// counter table (`hits`).
module.exports = function rateLimit({ windowMs, max, message }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, 60 * 1000).unref();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message: message || 'Too many requests. Please wait a few minutes and try again.' });
    }
    next();
  };
};
