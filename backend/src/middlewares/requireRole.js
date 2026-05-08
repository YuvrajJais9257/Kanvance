/**
 * requireRole(...roles)
 *
 * Factory that returns a middleware enforcing role-based access.
 * Usage:  router.delete("/:id", requireRole("ADMIN"), ctrl.remove)
 *
 * Rules:
 *  - 401 if no valid session (not authenticated)
 *  - 403 if authenticated but role not in the allowed list
 *  - Deny by default: if role is missing from session, access is denied
 */
module.exports = function requireRole(...roles) {
  return (req, res, next) => {
    // Always pass OPTIONS preflight through
    if (req.method === "OPTIONS") return next();

    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userRole = req.session.userRole ?? "MEMBER";
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: `Forbidden — requires one of: ${roles.join(", ")}`,
      });
    }
    next();
  };
};
