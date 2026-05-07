import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Wraps a route element.
 * - While session check is in flight → show nothing (avoids flash)
 * - No valid session → redirect to /login
 * - Valid session → render children
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}
