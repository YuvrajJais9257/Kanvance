/**
 * requireAuth middleware
 * Rejects requests that don't have a valid session.
 * Attach to any route that requires authentication.
 */
module.exports = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
};
