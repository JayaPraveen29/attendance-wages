// App.jsx — top-level routing and role-based access.
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import NavBar from "./components/NavBar";
import LoginPage from "./pages/LoginPage/LoginPage";
import AwaitingApproval from "./pages/AwaitingApproval/AwaitingApproval";
import Attendance from "./pages/Attendance/Attendance";
import CreateEmployee from "./pages/CreateEmployee/CreateEmployee";
import ManageEmployees from "./pages/ManageEmployees/ManageEmployees";
import Salaries from "./pages/Salaries/Salaries";
import Approvals from "./pages/Approvals/Approvals";
import { homePath, canManageEmployees, canUseSalaries, canApprove } from "./lib/permissions";

function Shell({ children }) {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-content">{children}</main>
    </div>
  );
}

// One line per page: path + which permission helper may open it (null = any approved user).
function page(path, Component, allow = null) {
  return (
    <Route
      path={path}
      element={
        <ProtectedRoute allow={allow}>
          <Shell><Component /></Shell>
        </ProtectedRoute>
      }
    />
  );
}

function AppRoutes() {
  const { user, profile, loading } = useAuth();
  if (loading) return null;

  // Signed out -> Sign in / Sign up
  if (!user) return <LoginPage />;
  // Signed in but not approved (pending / rejected / no record) -> waiting screen
  if (!profile || profile.status !== "approved") return <AwaitingApproval />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to={homePath(profile)} replace />} />
      {page("/attendance", Attendance)}
      {page("/employees/new", CreateEmployee, canManageEmployees)}
      {page("/employees", ManageEmployees, canManageEmployees)}
      {page("/salaries", Salaries, canUseSalaries)}
      {page("/approvals", Approvals, canApprove)}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
