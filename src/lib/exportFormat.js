// lib/exportFormat.js
//
// The heading that goes at the TOP of every Excel / PDF export.
// Change this one function when the final heading format is decided.
//
//   title     e.g. "Actual salary report"
//   monthText e.g. "November 2026"
//   group, unit  what is chosen in the Group / Unit dropdowns ("All" when none)
//
// Return one string per heading line (they are printed above the table).
export function headingLines({ title, monthText, group, unit }) {
  return [title, monthText, `Group: ${group || "All"}    Unit: ${unit || "All"}`];
}

// Words under the table in the PDF: left, centre, right.
export const PDF_SIGNATURES = { left: "Prepared by", center: "Checked by", right: "Authority" };

// Columns that get a total in the "Total" row.
export const TOTAL_HEADERS = new Set([
  "Salary", "Days Amt", "OT HRS", "OT AMT", "Total", "ADV", "EPF", "ESI", "PT", "Bank", "Amt (Cash)",
  "Paysheet salary", "Salary payable", "Total deductions", "Bank transfer",
  "OT", "D.Amt", "OT Amt", "Income", "TDS",
]);

// Columns left out of the PDF (they stay in the Excel file).
export const PDF_SKIP_HEADERS = new Set(["Bank Name", "Account number", "IFSC"]);
