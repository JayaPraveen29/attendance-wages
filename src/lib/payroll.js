// lib/payroll.js
//
// Pure payroll maths + Firestore access. All the rules live at the top so they
// are easy to change.
//
//   payroll/{YYYY-MM}        { workingDays, finalized, finalizedBy, finalizedAt, snapshot[], editedAfterFinalize }
//   payrollEntries/{YYYY-MM}_{employeeId} { month, employeeId, hra, advance, pt (override or null) }

import {
  collection, doc, setDoc, onSnapshot, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------- rules ----------------
export const DEFAULT_WORKING_DAYS = 26;

// Does an approved "Leave" day count as a paid day? (Presumed NO — change here.)
export const LEAVE_IS_PAID = false;

export const EPF_RATE = 0.12;
export const EPF_WAGE_CAP = 25000;      // EPF is 12% of earned salary, up to this much
export const ESI_RATE = 0.0075;         // 0.75% employee share
export const ESI_GROSS_LIMIT = 21000;   // only if monthly gross salary <= this

// Professional Tax by monthly gross. ASSUMED slabs — replace with your state's.
export const PT_SLABS = [
  { upTo: 21000, pt: 150 },
  { upTo: Infinity, pt: 200 },
];
export const ptForSalary = (gross) => PT_SLABS.find((s) => gross <= s.upTo).pt;

// ---------------- maths ----------------
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));

export function computeRow({ employee, counts, workingDays, entry }) {
  const c = counts || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
  const e = entry || {};
  const gross = num(employee.grossSalary);
  const wd = Math.max(1, num(workingDays));

  const paidDays = Math.min(
    wd,
    c.Present + 0.5 * c["Half day"] + (LEAVE_IS_PAID ? c.Leave : 0)
  );
  const earned = r2((gross / wd) * paidDays);
  const hra = r2(num(e.hra));

  const epf = employee.epf ? Math.round(EPF_RATE * Math.min(earned, EPF_WAGE_CAP)) : 0;
  // ESIC rounds the contribution UP to the next rupee.
  const esi = employee.esi && gross <= ESI_GROSS_LIMIT ? Math.ceil(ESI_RATE * (earned + hra)) : 0;

  const ptOverridden = e.pt !== "" && e.pt != null;
  const pt = ptOverridden ? r2(num(e.pt)) : paidDays > 0 ? ptForSalary(gross) : 0;
  const advance = r2(num(e.advance));

  const totalEarnings = r2(earned + hra);
  const totalDeductions = r2(epf + esi + pt + advance);

  return {
    employeeId: employee.id,
    code: employee.code,
    name: employee.name,
    group: employee.group || "",
    bankName: employee.bankName || "",
    accountNumber: employee.accountNumber || "",
    ifsc: employee.ifsc || "",
    gross,
    present: c.Present, halfDay: c["Half day"], leave: c.Leave, absent: c.Absent,
    paidDays, earned, hra, epf, esi, pt, ptOverridden, advance,
    totalEarnings, totalDeductions,
    net: r2(totalEarnings - totalDeductions),
  };
}

export const sumRows = (rows, key) => r2(rows.reduce((s, r) => s + num(r[key]), 0));

// ---------------- firestore ----------------
export function listenPayrollMonth(month, callback, onError) {
  return onSnapshot(
    doc(db, "payroll", month),
    (snap) => callback(snap.exists() ? snap.data() : null),
    onError
  );
}

export function savePayrollMonth(month, data) {
  return setDoc(doc(db, "payroll", month), data, { merge: true });
}

export function finalizeMonth(month, rows, byName) {
  return savePayrollMonth(month, {
    finalized: true, finalizedBy: byName, finalizedAt: serverTimestamp(), snapshot: rows,
  });
}

export function reopenMonth(month, byName) {
  return savePayrollMonth(month, {
    finalized: false, editedAfterFinalize: true, reopenedBy: byName, reopenedAt: serverTimestamp(),
  });
}

// map: employeeId -> { hra, advance, pt }
export function listenEntries(month, callback, onError) {
  const q = query(collection(db, "payrollEntries"), where("month", "==", month));
  return onSnapshot(
    q,
    (snap) => {
      const map = {};
      snap.forEach((d) => { map[d.data().employeeId] = d.data(); });
      callback(map);
    },
    onError
  );
}

export function saveEntry(month, employeeId, patch) {
  return setDoc(
    doc(db, "payrollEntries", `${month}_${employeeId}`),
    { month, employeeId, ...patch },
    { merge: true }
  );
}
