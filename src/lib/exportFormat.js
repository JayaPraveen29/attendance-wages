
export function headingLines({ title, monthText }) {
  return [title, monthText];
}


export const PDF_SIGNATURES = { left: "Prepared by", center: "Checked by", right: "Authority" };


export const TOTAL_HEADERS = new Set([
  "Salary", "Days Amt", "OT HRS", "OT AMT", "Total", "ADV", "EPF", "ESI", "PT", "Bank", "Amt (Cash)",
  "Paysheet salary", "Salary payable", "Total deductions", "Bank transfer",
  "OT", "D.Amt", "OT Amt", "Income", "TDS",
]);


export const PDF_SKIP_HEADERS = new Set(["Bank Name", "Account number", "IFSC"]);