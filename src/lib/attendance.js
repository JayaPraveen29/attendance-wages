// lib/attendance.js
//
//   attendance/{employeeId}_{YYYY-MM-DD} { employeeId, date, status, ot (workers, hours), markedBy, updatedAt }
// The doc id makes "one status per employee per day" automatic.

import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export const STATUSES = ["Present", "Half day", "Leave", "Absent", "Holiday"];
export const STATUS_SHORT = { Present: "P", "Half day": "H", "HD Leave": "HL", LS: "LS", Leave: "L", Absent: "A", Holiday: "HD" };
export const STATUS_BADGE = { Present: "green", "Half day": "amber", "HD Leave": "amber", LS: "grey", Leave: "grey", Absent: "red", Holiday: "amber" };

// Admin Staff and Field Staff keep the normal "Leave" button (shown as LS only on the Salaries paysheets) and also get
// "H.d leave sanctioned" (stored as "HD Leave"): it counts 0.5 in Present and the other 0.5 falls in LP.
export const HD_LEAVE = "HD Leave";
export const LEAVE_SANCTIONED = "LS"; // stored value of the "Leave sanctioned" button (paid; shown in the LS column)
// Older builds may have stored the button text itself; read it as LS.
const normStatus = (st) => (st === "Leave sanctioned" ? "LS" : st);
export const LS_CATEGORIES = ["Admin Staff", "Field Staff"];
export const usesLeaveSanctioned = (emp) => LS_CATEGORIES.includes(emp?.category);
export const statusesFor = (emp) =>
  usesLeaveSanctioned(emp) ? ["Present", "Half day", HD_LEAVE, LEAVE_SANCTIONED, "Leave", "Absent", "Holiday"] : STATUSES;
export const statusLabel = (status, emp) =>
  status === HD_LEAVE ? "H.d leave sanctioned"
    : status === LEAVE_SANCTIONED ? "Leave sanctioned"
    : status;

// merge:true so changing the status keeps an OT value already saved for that day.
// ot (hours) is optional and only used for workers.
export function setAttendance(employeeId, date, status, markedBy, ot) {
  return setDoc(
    doc(db, "attendance", `${employeeId}_${date}`),
    {
      employeeId, date, status, markedBy, updatedAt: serverTimestamp(),
      ...(ot === undefined ? {} : { ot: Number(ot) || 0 }),
    },
    { merge: true }
  );
}

// Unmark: remove the posted attendance for that day (status and any OT hours with it).
export function clearAttendance(employeeId, date) {
  return deleteDoc(doc(db, "attendance", `${employeeId}_${date}`));
}

// Save only the OT hours for a day (workers).
export function setOvertime(employeeId, date, ot, markedBy) {
  return setDoc(
    doc(db, "attendance", `${employeeId}_${date}`),
    { employeeId, date, ot: Number(ot) || 0, markedBy, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Live attendance for an inclusive date range ("YYYY-MM-DD" strings).
// callback gets a map: `${employeeId}_${date}` -> status
export function listenAttendance(startDate, endDate, callback, onError) {
  const q = query(
    collection(db, "attendance"),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  return onSnapshot(
    q,
    (snap) => {
      const map = {};
      snap.forEach((d) => {
        const x = d.data();
        map[`${x.employeeId}_${x.date}`] = normStatus(x.status);
      });
      callback(map);
    },
    onError
  );
}

// Same as listenAttendance but each entry is { status, ot } (ot = OT hours, 0 if none).
export function listenAttendanceDetails(startDate, endDate, callback, onError) {
  const q = query(
    collection(db, "attendance"),
    where("date", ">=", startDate),
    where("date", "<=", endDate)
  );
  return onSnapshot(
    q,
    (snap) => {
      const map = {};
      snap.forEach((d) => {
        const x = d.data();
        map[`${x.employeeId}_${x.date}`] = { status: normStatus(x.status), ot: Number(x.ot) || 0 };
      });
      callback(map);
    },
    onError
  );
}

// Count statuses per employee from a listenAttendance map.
// -> { [employeeId]: { Present, "Half day", "HD Leave", Leave, Absent } }
export function countsByEmployee(map) {
  const out = {};
  for (const [key, status] of Object.entries(map)) {
    const id = key.slice(0, key.lastIndexOf("_"));
    out[id] = out[id] || { Present: 0, "Half day": 0, "HD Leave": 0, LS: 0, Holiday: 0, Leave: 0, Absent: 0 };
    // Holiday is counted on its own only: it is not added to P, Leave / LS, or paid days.
    if (status in out[id]) out[id][status] += 1;
  }
  return out;
}