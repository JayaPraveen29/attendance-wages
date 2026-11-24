// lib/users.js
//
// Accounts and approvals.
//
//   users/{uid} {
//     name, email,
//     requestedRole,                 // what the person asked for at sign-up
//     role,                          // what the approver granted
//     status: "pending" | "approved" | "rejected",
//     createdAt, approvedBy, approvedAt, rejectedBy, rejectedAt
//   }
//   meta/bootstrap { firstUid, createdAt }   // exists once the first account is made

import {
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";
import {
  collection, doc, deleteDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { auth, db } from "../firebase";

// Creates the Firebase account + the access doc. The very FIRST account ever
// created becomes an approved Admin; everyone else starts as "pending".
export async function requestAccess({ name, email, password, role }) {
  const cleanEmail = email.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  try {
    await runTransaction(db, async (tx) => {
      const bootRef = doc(db, "meta", "bootstrap");
      const userRef = doc(db, "users", cred.user.uid);
      const boot = await tx.get(bootRef);
      if (!boot.exists()) {
        tx.set(bootRef, { firstUid: cred.user.uid, createdAt: serverTimestamp() });
        tx.set(userRef, {
          name: name.trim(), email: cleanEmail,
          requestedRole: role, role: "Admin", status: "approved",
          createdAt: serverTimestamp(), approvedAt: serverTimestamp(), approvedBy: "system (first account)",
        });
      } else if (role === "Admin") {
      tx.set(userRef, {
        name: name.trim(), email: cleanEmail,
        requestedRole: role, role: "Admin", status: "approved",
        createdAt: serverTimestamp(), approvedAt: serverTimestamp(), approvedBy: "auto (admin sign-up)",
      });
      } else {
        tx.set(userRef, {
          name: name.trim(), email: cleanEmail,
          requestedRole: role, role: null, status: "pending",
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (err) {
    // Don't leave a half-created account behind.
    try { await deleteUser(cred.user); } catch { /* ignore */ }
    throw err;
  }
}

export function listenUsers(callback, onError) {
  const q = query(collection(db, "users"), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))),
    onError
  );
}

export function approveUser(uid, role, approvedBy) {
  return updateDoc(doc(db, "users", uid), {
    status: "approved", role, approvedBy, approvedAt: serverTimestamp(),
  });
}

export function rejectUser(uid, rejectedBy) {
  return updateDoc(doc(db, "users", uid), {
    status: "rejected", role: null, rejectedBy, rejectedAt: serverTimestamp(),
  });
}

export function changeRole(uid, role) {
  return updateDoc(doc(db, "users", uid), { role });
}

// Removes the access record. (A browser app cannot delete another person's
// Firebase Auth login; without this doc they have no access to anything.)
export function deleteUserAccess(uid) {
  return deleteDoc(doc(db, "users", uid));
}
