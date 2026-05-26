/**
 * requireAuth middleware
 *
 * Rejects requests that don't have a valid session.
 * OPTIONS preflight requests are always allowed through.
 *
 * Role-version validation (instant privilege revocation):
 *   Every session stores the role_version that was current at login.
 *   On each request we do a single lightweight SELECT to compare the
 *   session's version against the DB. If they differ, the user's role
 *   or status was changed by an admin — we re-hydrate the session with
 *   the current values immediately. If the user has been deleted or
 *   disabled, we destroy the session and return 401.
 *
 * Cost: one SELECT per authenticated request (indexed PK lookup).
 * Benefit: privilege changes take effect on the very next request,
 *   with no need for the user to log out and back in.
 */
const pool      = require("../config/db");
const UserModel = require("../models/user.model");

module.exports = async (req, res, next) => {
  // Always pass OPTIONS through — CORS preflight must not be blocked by auth
  if (req.method === "OPTIONS") return next();

  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    // One lightweight PK lookup per request — validates role_version and
    // catches deleted / disabled accounts immediately.
    const current = await UserModel.getRoleVersion(req.session.userId);

    // User was hard-deleted or soft-deleted since this session was created
    if (!current) {
      return req.session.destroy(() =>
        res.status(401).json({ error: "Authentication required" })
      );
    }

    // Account was disabled since this session was created
    if (current.status === "disabled" || current.status === "inactive") {
      return req.session.destroy(() =>
        res.status(401).json({ error: "Account is inactive. Contact an administrator." })
      );
    }

    const sessionVersion = req.session.roleVersion ?? 0;

    // Version mismatch — role or status changed since this session was issued.
    // Re-hydrate the session with the current values so the change takes effect
    // on this request rather than waiting for the user to log out.
    if (current.role_version !== sessionVersion) {
      req.session.userRole    = current.role;
      req.session.roleVersion = current.role_version;

      // Also refresh group privilege level
      if (current.group_id) {
        const [[group]] = await pool.execute(
          "SELECT privilege_level FROM user_groups WHERE id = ?",
          [current.group_id]
        );
        req.session.privilegeLevel = group ? group.privilege_level : "MEMBER";
      } else {
        req.session.privilegeLevel = "MEMBER";
      }
    }

    // Back-fill roleVersion for sessions created before this feature was added
    if (req.session.roleVersion === undefined) {
      req.session.roleVersion = current.role_version;
    }

    // Back-fill userRole for very old sessions (pre-role-tracking)
    if (!req.session.userRole) {
      req.session.userRole = current.role;

      if (current.group_id) {
        const [[group]] = await pool.execute(
          "SELECT privilege_level FROM user_groups WHERE id = ?",
          [current.group_id]
        );
        req.session.privilegeLevel = group ? group.privilege_level : "MEMBER";
      } else {
        req.session.privilegeLevel = "MEMBER";
      }
    }
  } catch (err) {
    return next(err);
  }

  return next();
};
