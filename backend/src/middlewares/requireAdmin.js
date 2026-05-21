/**
 * requireAdmin middleware
 * Restricts access to admin-only routes
 * Returns 403 if user is not an admin
 */
module.exports = (req, res, next) => {
  const userRole = req.session.userRole;
  const privilegeLevel = req.session.privilegeLevel;

  // Check both role and privilege_level for admin access
  const isAdmin = 
    userRole === 'ADMIN' || 
    privilegeLevel === 'ADMIN' || 
    privilegeLevel === 'MASTER_ADMIN';

  if (!isAdmin) {
    return res.status(403).json({ 
      error: "Admin access required. This action is restricted to administrators only." 
    });
  }

  next();
};
