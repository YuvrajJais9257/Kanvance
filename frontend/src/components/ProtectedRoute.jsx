import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLE_RANK = { MEMBER: 1, MANAGER: 2, ADMIN: 3, MASTER_ADMIN: 4 };

/**
 * Returns the effective role — the highest-ranked role between the user's
 * own role and their group's privilege_level.
 */
function getEffectiveRole(user) {
  if (!user) return "MEMBER";
  const userRank  = ROLE_RANK[user.role]                  ?? 1;
  const groupRank = ROLE_RANK[user.group_privilege_level] ?? 1;
  return userRank >= groupRank ? (user.role ?? "MEMBER") : user.group_privilege_level;
}

/**
 * Wraps a route element.
 * - While session check is in flight → show nothing (avoids flash)
 * - No valid session → redirect to /login
 * - requiredRole provided → redirect to / if effective role rank is below it
 * - Valid session (and role) → render children
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;

  if (requiredRole) {
    const effectiveRole = getEffectiveRole(user);
    const effectiveRank = ROLE_RANK[effectiveRole] ?? 1;
    const requiredRank  = ROLE_RANK[requiredRole]  ?? 1;
    if (effectiveRank < requiredRank) {
      return <Navigate to="/" replace />;
    }
  }

  return <div className="page-enter">{children}</div>;
}
