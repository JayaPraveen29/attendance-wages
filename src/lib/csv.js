// lib/csv.js — tiny CSV export (no dependency)

const esc = (v) => {
  const s = v == null ? "" : String(v);
  // Quote when needed; also neutralise spreadsheet formulas (=, +, -, @).
  const safe = /^[=+\-@]/.test(s) && isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// columns: [{ header, value: (row) => any }]
export function toCsv(rows, columns) {
  const head = columns.map((c) => esc(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

export function downloadCsv(filename, text) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
