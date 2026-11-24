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
// These follow the company paysheet (SIEC_WAGES_PAYSHEET_UNIT_II.xlsx):
//
//   LP (loss of pay days)  = working days - P - L
//   Paid days              = P + L                    (P counts a half day as 0.5)
//   Salary payable         = ROUND(Gross / working days * paid days, 0)
//   Total payable          = Salary payable + HRA
//   EPF                    = ROUND(12% of Salary payable, capped at the EPF wage ceiling, 0)
//   ESI                    = ROUNDUP(0.75% of Salary payable, capped at 21,000, 0)   (HRA is NOT included)
//   PT                     = by Gross salary slab (editable per row)
//   Total deductions       = Adv + EPF + ESI + PT
//   Bank transfer (net)    = Total payable - Total deductions
export const DEFAULT_WORKING_DAYS = 26;

// Approved "Leave" counts as a paid day (the sheet pays P + L).
export const LEAVE_IS_PAID = true;

export const EPF_RATE = 0.12;
// EPF wage ceiling: 15,000 up to Aug 2026, 25,000 from Sep 2026 (as in the paysheet).
export const EPF_WAGE_CAP_OLD = 15000;
export const EPF_WAGE_CAP_NEW = 25000;
export const EPF_NEW_CAP_FROM = "2026-09";
export const epfCapFor = (month) => (!month || month >= EPF_NEW_CAP_FROM ? EPF_WAGE_CAP_NEW : EPF_WAGE_CAP_OLD);

export const ESI_RATE = 0.0075;         // 0.75% employee share
export const ESI_WAGE_CAP = 21000;      // contribution is calculated on at most this much

// Professional Tax by monthly GROSS salary (as used in the paysheet).
export const PT_SLABS = [
  { upTo: 15000, pt: 0 },
  { upTo: 20000, pt: 150 },
  { upTo: Infinity, pt: 200 },
];
export const ptForSalary = (gross) => PT_SLABS.find((s) => gross <= s.upTo).pt;

// ---------------- maths ----------------
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));

export function computeRow({ employee, counts, workingDays, entry, month }) {
  const c = counts || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
  const e = entry || {};
  const gross = num(employee.grossSalary);
  const wd = Math.max(1, num(workingDays));

  const p = c.Present + 0.5 * c["Half day"];                 // P
  const l = c.Leave;                                         // L
  const lp = Math.max(0, wd - p - l);                        // LP
  const paidDays = Math.min(wd, p + (LEAVE_IS_PAID ? l : 0)); // Paid

  // Salary payable, whole rupees (same order of operations as the sheet: Gross / days * paid)
  const earned = Math.round((gross / wd) * paidDays);
  const hra = r2(num(e.hra));

  // EPF / ESI work on whole rupees, so integer maths keeps them exact.
  const epfBase = Math.min(earned, epfCapFor(month));
  const epf = employee.epf ? Math.round((epfBase * 12) / 100) : 0;
  const esiBase = Math.min(earned, ESI_WAGE_CAP);
  const esi = employee.esi ? Math.ceil((esiBase * 75) / 10000) : 0;

  const ptOverridden = e.pt !== "" && e.pt != null;
  const pt = ptOverridden ? r2(num(e.pt)) : paidDays > 0 ? ptForSalary(gross) : 0;
  const advance = r2(num(e.advance));

  const totalEarnings = r2(earned + hra);                    // Total payable
  const totalDeductions = r2(advance + epf + esi + pt);      // Total deductions

  return {
    employeeId: employee.id,
    code: employee.code,
    name: employee.name,
    group: employee.group || "",
    bankName: employee.bankName || "",
    accountNumber: employee.accountNumber || "",
    ifsc: employee.ifsc || "",
    gross,
    present: c.Present, halfDay: c["Half day"], leave: l, absent: c.Absent, lp,
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