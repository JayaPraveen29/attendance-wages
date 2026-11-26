// lib/payslip.js — turns one employee's month into payslip lines (earnings, deductions, net).
// Uses the same rules as the Salaries page: Workers (and other staff) through computeRow,
// Casuals and Directors with their own simple rules.

import { computeRow, PAY_DIVISOR, OT_HOURS_PER_DAY } from "./payroll";

const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));
const roundTo10 = (n) => Math.round(n / 10) * 10;

// -> { daysLabel, earnings: [{label, amount}], deductions: [{label, amount}], gross, totalDeductions, net }
export function buildPayslip({ employee: e, counts, otHours, entry, workingDays, actualDays, snapshotRow }) {
  const c = counts || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };

  if (e.category === "Directors") {
    const income = num(e.grossSalary);
    const tds = num(entry?.tds);
    return {
      daysLabel: "",
      earnings: [{ label: "Income", amount: income }],
      deductions: [{ label: "TDS", amount: tds }],
      gross: income, totalDeductions: tds, net: income - tds,
    };
  }

  if (e.category === "Casuals") {
    const isDaily = num(e.daySalary) > 0;
    const rate = isDaily ? num(e.daySalary) : (num(e.monthlySalary) > 0 ? num(e.monthlySalary) : num(e.grossSalary));
    const dayRate = isDaily ? rate : rate / PAY_DIVISOR;
    const days = c.Present + 0.5 * c["Half day"];
    const ot = entry?.casualOt !== undefined && entry?.casualOt !== "" ? num(entry.casualOt) : num(otHours);
    const dAmt = Math.round(dayRate * days);
    const otAmt = Math.round((dayRate / OT_HOURS_PER_DAY) * ot);
    const total = roundTo10(dAmt + otAmt);
    const earnings = [
      { label: `Days (${days} × ${rate})`, amount: dAmt },
      { label: `Overtime (${ot} hrs)`, amount: otAmt },
    ];
    if (total !== dAmt + otAmt) earnings.push({ label: "Rounding", amount: total - dAmt - otAmt });
    return { daysLabel: `${days} days`, earnings, deductions: [], gross: total, totalDeductions: 0, net: total };
  }

  // Workers and every other category
  const r = snapshotRow || computeRow({
    employee: e, counts: c, workingDays, payDays: actualDays,
    entry: { ...(entry || {}), otHours: num(otHours) },
  });
  const earnings = [
    { label: `Salary (${r.paidDays} days)`, amount: r.earned },
    { label: `Overtime (${r.otHours} hrs)`, amount: r.otAmt },
  ];
  const rounding = r.totalEarnings - r.earned - r.otAmt;
  if (rounding) earnings.push({ label: "Rounding", amount: rounding });
  const deductions = [
    { label: "PT", amount: r.pt },
    { label: "EPF", amount: r.epf },
    { label: "ESI", amount: r.esi },
    { label: "Advance", amount: r.advance },
  ];
  const totalDeductions = deductions.reduce((t, d) => t + num(d.amount), 0);
  return {
    daysLabel: `${r.paidDays} days`,
    earnings, deductions,
    gross: r.totalEarnings, totalDeductions, net: r.totalEarnings - totalDeductions,
  };
}
