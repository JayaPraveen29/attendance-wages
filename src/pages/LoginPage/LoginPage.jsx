// pages/LoginPage/LoginPage.jsx — Sign in / Sign up (one screen, two tabs)
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { requestAccess } from "../../lib/users";
import { ROLES, roleLabel } from "../../lib/permissions";
import "./LoginPage.css";

function friendly(err) {
  switch (err?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/email-already-in-use": return "An account with this email already exists. Please sign in.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/invalid-email": return "That email address is not valid.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a bit and try again.";
    case "permission-denied":
      return "Firestore refused the request. Check that Firestore is created and that firestore.rules is published in the Firebase console.";
    case "unavailable":
      return "Cannot reach Firestore. Check your internet connection and that the Firestore database has been created.";
    default:
      return `${err?.message || "Something went wrong."}${err?.code ? ` (${err.code})` : ""}`;
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", role: "Employee" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "signup") {
      if (!form.name.trim()) return setError("Please enter your name.");
      if (form.password !== form.confirm) return setError("Passwords do not match.");
    }
    setBusy(true);
    try {
      if (mode === "signin") await login(form.email, form.password);
      else await requestAccess({ name: form.name, email: form.email, password: form.password, role: form.role });
      // On success, AuthContext updates and App swaps the screen.
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-logo"><span>₹</span>SIEC Payroll</div>
        <h2>Attendance and salaries, settled every month.</h2>
        <p>Mark attendance each day. At month end the paysheet is already worked out.</p>
      </aside>

      <main className="auth-form-side">
        <form className="login-card" onSubmit={submit}>
          <h1>{mode === "signin" ? "Welcome back" : "Request an account"}</h1>
          <p className="login-sub">
            {mode === "signin" ? "Sign in to continue." : "A Director or Admin will review your request."}
          </p>

          <div className="tabs">
            <button type="button" className={`tab ${mode === "signin" ? "active" : ""}`} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
            <button type="button" className={`tab ${mode === "signup" ? "active" : ""}`} onClick={() => { setMode("signup"); setError(""); }}>Sign up</button>
          </div>

          {error && <div className="msg error">{error}</div>}

          {mode === "signup" && (
            <label className="field">Full name
              <input value={form.name} onChange={set("name")} autoComplete="name" required />
            </label>
          )}
          <label className="field">Email
            <input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
          </label>
          <label className="field">Password
            <input type="password" value={form.password} onChange={set("password")} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={6} />
          </label>
          {mode === "signup" && (
            <>
              <label className="field">Confirm password
                <input type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" required />
              </label>
              <label className="field">Role you are requesting
                <select value={form.role} onChange={set("role")}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              </label>
            </>
          )}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </main>
    </div>
  );
}
