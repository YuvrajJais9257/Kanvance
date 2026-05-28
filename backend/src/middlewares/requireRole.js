/**
 * requireRole(...roles)
 *
 * Factory that returns a middleware enforcing role-based access.
 * Usage:  router.delete("/:id", requireRole("ADMIN"), ctrl.remove)
 *
 * Rules:
 *  - 401 if no valid session (not authenticated)
 *  - 403 if authenticated but effective role not in the allowed list
 *  - Deny by default: if role is missing from session, access is denied
 *
 * Effective role = highest of user's own role and their group's privilege_level.
 * This ensures a MEMBER user in an ADMIN group gets ADMIN-level access.
 */

const ROLE_RANK = { MEMBER: 1, MANAGER: 2, ADMIN: 3, MASTER_ADMIN: 4 };

/**
 * Returns the effective role — the highest-ranked role between the user's
 * own role and their group's privilege_level.
 */
function getEffectiveRole(session) {
  const userRole      = session.userRole      ?? "MEMBER";
  const privilegeLevel = session.privilegeLevel ?? "MEMBER";
  const userRank      = ROLE_RANK[userRole]      ?? 1;
  const groupRank     = ROLE_RANK[privilegeLevel] ?? 1;
  return userRank >= groupRank ? userRole : privilegeLevel;
}

module.exports = function requireRole(...roles) {
  return (req, res, next) => {
    // Always pass OPTIONS preflight through
    if (req.method === "OPTIONS") return next();

    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const effectiveRole = getEffectiveRole(req.session);

    // MASTER_ADMIN supersedes all role checks
    if (effectiveRole === "MASTER_ADMIN") return next();

    if (!roles.includes(effectiveRole)) {
      return res.status(403).json({
        error: `Forbidden — requires one of: ${roles.join(", ")}`,
      });
    }
    next();
  };
};

module.exports.getEffectiveRole = getEffectiveRole;
