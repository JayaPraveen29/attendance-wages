// components/ProtectedRoute.jsx
//
// Wrap a page with this to require an APPROVED login.
//   - not signed in            -> "/" (login)
//   - signed in, not approved  -> "/" (App shows the Awaiting Approval screen)
//   - allow={fn}               -> fn(profile) must be true, else back to home
//                                 (use the helpers from lib/permissions.js)

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homePath } from "../lib/permissions";

export default function ProtectedRoute({ children, allow = null }) {
  const { profile, loading } = useAuth();

  if (loading) return null;
  if (!profile || profile.status !== "approved") return <Navigate to="/" replace />;
  if (allow && !allow(profile)) return <Navigate to={homePath(profile)} replace />;
  return children;
}
