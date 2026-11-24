// pages/AwaitingApproval/AwaitingApproval.jsx
// Shown to a signed-in user until a Director/Admin approves them.
// It updates by itself the moment the approval happens (live listener).
import { useAuth } from "../../context/AuthContext";
import { roleLabel } from "../../lib/permissions";
import "../LoginPage/LoginPage.css";

export default function AwaitingApproval() {
  const { user, profile, logout } = useAuth();

  let title = "Awaiting approval";
  let body = "Your account has been created. A Director or Admin needs to approve it before you can use the app. This page will open automatically once you are approved.";
  let tone = "warn";

  if (!profile) {
    title = "Account not found";
    body = "There is no access record for this login. If you just signed up, wait a few seconds. Otherwise your account may have been removed — please contact a Director or Admin.";
    tone = "error";
  } else if (profile.status === "rejected") {
    title = "Request not approved";
    body = "Your access request was not approved. Please contact a Director or Admin.";
    tone = "error";
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>{title}</h1>
        <div className={`msg ${tone}`}>{body}</div>
        <p className="login-note">
          Signed in as <strong>{profile?.name || user?.email}</strong>
          {profile?.requestedRole && <> · requested role: {roleLabel(profile.requestedRole)}</>}
        </p>
        <button className="btn secondary" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
