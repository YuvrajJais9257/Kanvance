/**
 * requireAdmin middleware
 * Restricts access to admin-only routes.
 * Uses effective role (highest of user role + group privilege_level).
 * Returns 403 if effective role is below ADMIN.
 */
const { getEffectiveRole } = require("./requireRole");

const ADMIN_ROLES = new Set(["ADMIN", "MASTER_ADMIN"]);

module.exports = (req, res, next) => {
  const effectiveRole = getEffectiveRole(req.session ?? {});

  if (!ADMIN_ROLES.has(effectiveRole)) {
    return res.status(403).json({
      error: "Admin access required. This action is restricted to administrators only.",
    });
  }

  next();
};
