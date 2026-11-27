// lib/attendance.js
//
//   attendance/{employeeId}_{YYYY-MM-DD} { employeeId, date, status, ot (workers, hours), markedBy, updatedAt }
// The doc id makes "one status per employee per day" automatic.

import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export const LS_STATUS = "Leave sanctioned";
export const STATUSES = ["Present", "Half day", "Leave", "Absent", "Holiday", LS_STATUS];
export const STATUS_SHORT = { Present: "P", "Half day": "H", Leave: "L", Absent: "A", Holiday: "HD", [LS_STATUS]: "LS" };
export const STATUS_BADGE = { Present: "green", "Half day": "amber", Leave: "grey", Absent: "red", Holiday: "amber", [LS_STATUS]: "green" };

// Workers and Casuals get an OT box; everyone else also gets "Leave sanctioned" (counted as Present).
export const isWorkerCategory = (e) => e?.category === "Workers" || e?.category === "Casuals";
export const statusesFor = (e) => (isWorkerCategory(e) ? STATUSES.filter((s) => s !== LS_STATUS) : STATUSES);

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
        map[`${x.employeeId}_${x.date}`] = x.status;
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
        map[`${x.employeeId}_${x.date}`] = { status: x.status, ot: Number(x.ot) || 0 };
      });
      callback(map);
    },
    onError
  );
}

// Count statuses per employee from a listenAttendance map.
// -> { [employeeId]: { Present, "Half day", Leave, Absent, Holiday } }
export function countsByEmployee(map) {
  const out = {};
  for (const [key, status] of Object.entries(map)) {
    const id = key.slice(0, key.lastIndexOf("_"));
    out[id] = out[id] || { Present: 0, "Half day": 0, Leave: 0, Absent: 0, Holiday: 0 };
    // Leave sanctioned is added to Present (shown as P + LS on the Attendance page).
    // A plain Leave is NOT paid: it falls into loss of pay until it is changed to Leave sanctioned.
    // A Holiday stays a paid day.
    if (status === LS_STATUS) out[id].Present += 1;
    else if (status in out[id]) out[id][status] += 1;
  }
  return out;
}