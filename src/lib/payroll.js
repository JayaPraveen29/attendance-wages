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
import { usesLeaveSanctioned } from "./attendance";

// ---------------- rules ----------------
// These follow the company paysheet (SIEC_WAGES_PAYSHEET_UNIT_II.xlsx):
//
//   LP (loss of pay days)  = working days - P - L   (an H.d leave sanctioned day = 0.5 in P + 0.5 in L, nothing in LP)
//   Paid days              = P + L                    (P counts a half day as 0.5)
//   Salary payable         = ROUND(Actual salary / 30 * paid days, 0)
//                            (Admin / Field staff: ROUND(Paysheet salary / working days * paid days, 0), they have no Actual salary)
//   OT amount              = ROUND(Actual salary / 30 / 8 * OT hours, 0)
//   Total                  = Salary payable + OT, rounded to nearest 10
//   PT                     = by Paysheet salary slab (editable per row)
//   EPF                    = 12% of Paysheet salary, capped at the 25,000 wage ceiling (max 3,000), if Paysheet salary is 25,000 or less,
//                            or if "EPF applicable" is ticked on the employee (even above 25,000)
//   ESI                    = 0.75% of Salary payable (Bank gross), only if Paysheet salary is 21,000 or less
//
//   Bank / Cash split:
//     Paysheet per day     = Paysheet salary / working days
//     Bank days            = Total / Paysheet per day, rounded DOWN to the nearest 0.5
//     Bank gross           = ROUND(Paysheet per day * Bank days, 0)
//     Bank                 = Bank gross - PT - EPF - ESI
//     Cash                 = Total - Bank gross - Adv, rounded to nearest 10
export const DEFAULT_WORKING_DAYS = 26;

// Salary and OT are divided by the "Days in month" box of the Actual report (30 if none is given).
// Working days is used for the paysheet per-day rate and LP.
export const PAY_DIVISOR = 30;
export const OT_HOURS_PER_DAY = 8;
const roundTo10 = (n) => Math.round(n / 10) * 10;

// Approved "Leave" counts as a paid day (the sheet pays P + L).
export const LEAVE_IS_PAID = true;

export const EPF_RATE = 0.12;
// EPF wage ceiling: 15,000 up to Aug 2026, 25,000 from Sep 2026 (as in the paysheet).
export const EPF_WAGE_CAP_OLD = 15000;
export const EPF_WAGE_CAP_NEW = 25000;
export const EPF_NEW_CAP_FROM = "2026-09";
export const epfCapFor = (month) => (!month || month >= EPF_NEW_CAP_FROM ? EPF_WAGE_CAP_NEW : EPF_WAGE_CAP_OLD);

// EPF applies only when the Paysheet salary is up to this; above it no EPF is deducted.
export const EPF_PAYSHEET_LIMIT = 25000;
// ESI applies only when the Paysheet salary is up to this.
export const ESI_PAYSHEET_LIMIT = 21000;
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

// payDays = the "Days in month" box of the Actual report: the divisor for salary and OT (defaults to 30).
export function computeRow({ employee, counts, workingDays, payDays, entry, month }) {
  const c = counts || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
  const e = entry || {};
  // gross = Actual Salary (shown as is). paysheetSalary = Paysheet salary, which only PT is calculated on (earned salary and OT use gross / Actual Salary).
  const gross = num(employee.actualSalary) > 0 ? num(employee.actualSalary) : num(employee.grossSalary);
  const paysheetSalary = num(employee.statutorySalary) > 0 ? num(employee.statutorySalary) : gross;
  const wd = Math.max(1, num(workingDays));
  const divisor = Math.max(1, num(payDays) || PAY_DIVISOR);   // days the salary is divided by

  const hdLeave = c["HD Leave"] || 0;                        // H.d leave sanctioned (Admin / Field staff): 0.5 day present, 0.5 day sanctioned leave (not LP)
  const p = c.Present + 0.5 * c["Half day"] + 0.5 * hdLeave; // P
  // Only "Leave sanctioned" (LS) is paid leave (Holiday counts for nothing). A plain "Leave" is not paid: it falls in LP
  // (for every category).
  // The sanctioned half of an H.d leave sanctioned day is paid leave too, so it is NOT added to LP.
  const l = (c.LS || 0) + 0.5 * hdLeave;                    // L (Holiday counts for nothing)
  const lp = Math.max(0, wd - p - l);                        // LP
  const lsShown = (c.LS || 0) + 0.5 * hdLeave;               // LS column: leave sanctioned + the sanctioned half of H.d leave (holidays are not shown here)
  const paidDays = p + (LEAVE_IS_PAID ? l : 0);              // Paid (not capped: salary is per day on a 30-day month)

  // Salary payable, whole rupees (same order of operations as the sheet: Gross / days * paid)
  // Admin / Field staff have no Actual salary: Salary payable = Paysheet salary / working days * paid days.
  // Everyone else: Actual salary / days in month * paid days.
  const isStaff = usesLeaveSanctioned(employee);
  const earned = isStaff
    ? Math.round((paysheetSalary / wd) * paidDays)
    : Math.round((gross / divisor) * paidDays);              // Salary payable, on Actual Salary
  const otHours = num(e.otHours);
  const otAmt = Math.round((gross / divisor / OT_HOURS_PER_DAY) * otHours); // OT is on Actual Salary
  const hra = 0; // HRA column removed from the sheet

  const ptOverridden = e.pt !== "" && e.pt != null;
  const pt = ptOverridden ? r2(num(e.pt)) : paidDays > 0 ? ptForSalary(paysheetSalary) : 0;
  const advance = r2(num(e.advance));

  const totalEarnings = roundTo10(earned + otAmt);           // Total (Salary payable + OT, nearest 10)

  // ---- Bank / Cash split ----
  const perDay = paysheetSalary / wd;                         // Paysheet salary / working days
  const bankDays = perDay > 0 ? Math.floor((totalEarnings / perDay) * 2 + 1e-9) / 2 : 0; // down to nearest 0.5
  // Salary payable can be typed over by hand (entry.salaryPayable > 0); 0 / empty = automatic
  const payableOverridden = num(e.salaryPayable) > 0;
  const bankGross = payableOverridden ? Math.round(num(e.salaryPayable))
    : isStaff ? earned                                        // Admin / Field staff: no bank-days rounding
    : Math.round(perDay * bankDays);
  // ESI is worked out on Salary payable (= Bank gross); EPF on the Paysheet salary (capped at 25,000)
  const epfApplies = paysheetSalary <= EPF_PAYSHEET_LIMIT || employee.epf === true;
  // EPF is worked out on the Paysheet salary (not on Salary payable), capped at the wage ceiling (25,000 from Sep 2026).
  const epf = epfApplies ? Math.round(Math.min(paysheetSalary, epfCapFor(month)) * EPF_RATE) : 0;
  const esi = paysheetSalary <= ESI_PAYSHEET_LIMIT ? Math.round(bankGross * ESI_RATE) : 0;
  const bank = r2(bankGross - pt - epf - esi);                // Bank = Bank gross - PT - EPF - ESI
  const cash = roundTo10(totalEarnings - bankGross - advance); // Cash = Total - Bank gross - Adv, nearest 10 (EPF / ESI already come off the bank amount)

  const totalDeductions = r2(advance + epf + esi + pt);      // Total deductions

  return {
    employeeId: employee.id,
    code: employee.code,
    name: employee.name,
    group: employee.group || "",
    bankName: employee.bankName || "",
    accountNumber: employee.accountNumber || "",
    ifsc: employee.ifsc || "",
    gross, paysheetSalary,
    present: c.Present, halfDay: c["Half day"], hdLeave, leave: l, ls: lsShown, absent: c.Absent, lp,
    paidDays, earned, otHours, otAmt, hra, epf, esi, pt, ptOverridden, advance,
    totalEarnings, totalDeductions,
    perDay: r2(perDay), bankDays, bankGross, payableOverridden, bank, cash,
    net: r2(bank + cash),                                      // total actually paid out (Bank + Cash)
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