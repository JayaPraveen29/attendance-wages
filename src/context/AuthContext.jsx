// context/AuthContext.jsx
//
// Firebase Auth (email + password) plus the approval step.
//
//   user     -> the Firebase Auth user (or null when signed out)
//   profile  -> users/{uid} doc, listened to live:
//               { uid, email, name, role, requestedRole, status }
//               null while the doc does not exist yet.
//
// Unlike a "hide until approved" setup, a pending user STAYS signed in and
// sees the Awaiting Approval screen; the moment an approver approves them,
// the live listener flips `status` and the app opens up.

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true); // until the FIRST auth + profile check ends

  useEffect(() => {
    let unsubDoc = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      unsubDoc = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          const d = snap.exists() ? snap.data() : null;
          setProfile(
            d
              ? {
                  uid: u.uid,
                  email: u.email,
                  name: d.name || u.email,
                  role: d.role || null,
                  requestedRole: d.requestedRole || null,
                  status: d.status || "pending",
                }
              : null
          );
          setLoading(false);
        },
        () => { setProfile(null); setLoading(false); }
      );
    });
    return () => { unsubAuth(); if (unsubDoc) unsubDoc(); };
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
