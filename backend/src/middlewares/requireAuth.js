/**
 * requireAuth middleware
 * Rejects requests that don't have a valid session.
 * OPTIONS preflight requests are always allowed through — the browser
 * sends them before the real request and they carry no credentials.
 */
module.exports = (req, res, next) => {
  // Always pass OPTIONS through — CORS preflight must not be blocked by auth
  if (req.method === "OPTIONS") return next();

  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
};
