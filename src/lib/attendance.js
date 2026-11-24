// lib/attendance.js
//
//   attendance/{employeeId}_{YYYY-MM-DD} { employeeId, date, status, markedBy, updatedAt }
// The doc id makes "one status per employee per day" automatic.

import {
  collection, doc, setDoc, onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export const STATUSES = ["Present", "Half day", "Leave", "Absent"];
export const STATUS_SHORT = { Present: "P", "Half day": "H", Leave: "L", Absent: "A" };
export const STATUS_BADGE = { Present: "green", "Half day": "amber", Leave: "grey", Absent: "red" };

export function setAttendance(employeeId, date, status, markedBy) {
  return setDoc(doc(db, "attendance", `${employeeId}_${date}`), {
    employeeId, date, status, markedBy, updatedAt: serverTimestamp(),
  });
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

// Count statuses per employee from a listenAttendance map.
// -> { [employeeId]: { Present, "Half day", Leave, Absent } }
export function countsByEmployee(map) {
  const out = {};
  for (const [key, status] of Object.entries(map)) {
    const id = key.slice(0, key.lastIndexOf("_"));
    out[id] = out[id] || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
    if (status in out[id]) out[id][status] += 1;
  }
  return out;
}
