// lib/exportFile.js — Excel (.xlsx) and PDF exports for the Salaries reports.
// Both libraries are loaded only when a button is pressed, so the page stays light.
//
//   columns: [{ header, value: (row) => cell }]     rows: array of row objects
//   The heading above the table comes from lib/exportFormat.js.

import { headingLines, PDF_SIGNATURES, TOTAL_HEADERS, PDF_SKIP_HEADERS } from "./exportFormat";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : Number(v));

// ["Total", "", 1200, ...] -- "Total" label in the first text column, sums under TOTAL_HEADERS
function totalsRow(columns, rows) {
  return columns.map((c, i) => {
    if (TOTAL_HEADERS.has(c.header)) {
      const sum = rows.reduce((t, r) => t + (isNaN(num(c.value(r))) ? 0 : num(c.value(r))), 0);
      return Math.round(sum * 100) / 100;
    }
    return i === 1 ? `Total (${rows.length})` : "";
  });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Excel ----------
export async function makeXlsx({ title, monthText, group, unit, columns, rows }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");

  headingLines({ title, monthText, group, unit }).forEach((line) => {
    const r = ws.addRow([line]);
    r.font = { bold: true, size: 13 };
  });
  ws.addRow([]);

  const head = ws.addRow(columns.map((c) => c.header));
  head.font = { bold: true };
  head.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEEA" } }; });

  rows.forEach((r) => ws.addRow(columns.map((c) => c.value(r))));
  ws.addRow(totalsRow(columns, rows)).font = { bold: true };

  columns.forEach((c, i) => {
    const longest = Math.max(c.header.length, ...rows.map((r) => String(c.value(r) ?? "").length));
    ws.getColumn(i + 1).width = Math.min(40, Math.max(8, longest + 2));
  });
  return wb.xlsx.writeBuffer();
}

export async function exportXlsx(opts, filename) {
  const buf = await makeXlsx(opts);
  saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

// ---------- PDF (landscape, ruled table, Prepared by / Checked by / Authority underneath) ----------
export async function makePdf({ title, monthText, group, unit, columns, rows }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const cols = columns.filter((c) => !PDF_SKIP_HEADERS.has(c.header));
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  let y = 12;
  headingLines({ title, monthText, group, unit }).forEach((line, i) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(i === 0 ? 14 : 11);
    doc.text(String(line), margin, y);
    y += i === 0 ? 6 : 5;
  });

  // numbers shown the Indian way (1,30,000); text left as it is
  const show = (v) => (v === undefined || v === null ? "" : typeof v === "number" ? v.toLocaleString("en-IN") : String(v));
  const textHeaders = new Set(["Emp ID", "Name", "S.No", "Bank Name", "Account number", "IFSC"]);
  autoTable(doc, {
    startY: y + 1,
    head: [cols.map((c) => c.header)],
    body: rows.map((r) => cols.map((c) => show(c.value(r)))),
    foot: [totalsRow(cols, rows).map(show)],
    showFoot: "lastPage",
    theme: "grid",
    margin: { left: margin, right: margin, top: 10, bottom: 10 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.6, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], overflow: "linebreak" },
    headStyles: { fillColor: [232, 238, 234], textColor: [0, 0, 0], fontStyle: "bold" },
    footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: textHeaders.has(c.header) ? "left" : "right" }])),
    didParseCell: (d) => {
      if (d.section !== "body" && !textHeaders.has(cols[d.column.index].header)) d.cell.styles.halign = "right";
    },
  });

  // Prepared by (left) · Checked by (centre) · Authority (right), under the table
  let sy = doc.lastAutoTable.finalY + 22;
  if (sy > pageH - 12) { doc.addPage(); sy = 40; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(PDF_SIGNATURES.left, margin, sy);
  doc.text(PDF_SIGNATURES.center, pageW / 2, sy, { align: "center" });
  doc.text(PDF_SIGNATURES.right, pageW - margin, sy, { align: "right" });
  return doc;
}

export async function exportPdf(opts, filename) {
  const doc = await makePdf(opts);
  doc.save(filename);
}
