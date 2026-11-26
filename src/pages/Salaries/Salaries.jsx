// pages/Salaries/Salaries.jsx
// Monthly payroll sheet. Attendance (from the Attendance page) drives paid days;
// Advance, EPF and ESI are editable per row. Finalize locks a snapshot of the month.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenEmployees } from "../../lib/employees";
import { listenAttendanceDetails, countsByEmployee } from "../../lib/attendance";
import {
  DEFAULT_WORKING_DAYS, computeRow, sumRows,
  listenPayrollMonth, listenEntries, saveEntry, savePayrollMonth, finalizeMonth, reopenMonth,
} from "../../lib/payroll";
import { thisMonth, datesOfMonth, monthLabel } from "../../lib/dates";
import { toCsv, downloadCsv } from "../../lib/csv";
import "./Salaries.css";

const inr = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Present shown on the sheet = full days + half of each half day (e.g. 20 + 2 half days = 21)
const presentDays = (r) => r.present + 0.5 * r.halfDay;
// LP = working days - P - L (loss-of-pay days), as in the paysheet
const lpDays = (r, wd) => (r.lp !== undefined ? r.lp : Math.max(0, wd - presentDays(r) - r.leave));


// Paysheet salary / working days (older finalized snapshots don't store it, so work it out)
const perDayOf = (r, wd) => (r.perDay !== undefined ? r.perDay : Math.round((r.paysheetSalary / Math.max(1, wd)) * 100) / 100);

// Sort by Emp ID (numeric when possible), then name
const byCode = (a, b) =>
  String(a.code ?? "").localeCompare(String(b.code ?? ""), undefined, { numeric: true }) ||
  String(a.name ?? "").localeCompare(String(b.name ?? ""));

const CSV_COLUMNS = (wd) => [
  { header: "Emp ID", value: (r) => r.code },
  { header: "Name", value: (r) => r.name },
  { header: "P", value: (r) => presentDays(r) },
  { header: "L", value: (r) => r.leave },
  { header: "LP", value: (r) => lpDays(r, wd) },
  { header: "Salary", value: (r) => r.gross },
  { header: "Paysheet", value: (r) => r.paysheetSalary },
  { header: "OT HRS", value: (r) => r.otHours },
  { header: "OT AMT", value: (r) => r.otAmt },
  { header: "Days Amt", value: (r) => r.earned },
  { header: "Total", value: (r) => r.totalEarnings },
  { header: "ADV", value: (r) => r.advance },
  { header: "PT", value: (r) => r.pt },
  { header: "EPF", value: (r) => r.epf },
  { header: "ESI", value: (r) => r.esi },
  { header: "Bank", value: (r) => r.bank ?? r.net },
  { header: "Amt (Cash)", value: (r) => r.cash ?? 0 },
  { header: "Bank Name", value: (r) => r.bankName },
  { header: "Account number", value: (r) => r.accountNumber },
  { header: "IFSC", value: (r) => r.ifsc },
];

const PAYSHEET_CSV_COLUMNS = (wd) => [
  { header: "Emp ID", value: (r) => r.code },
  { header: "Name", value: (r) => r.name },
  { header: "P", value: (r) => presentDays(r) },
  { header: "L", value: (r) => r.leave },
  { header: "LP", value: (r) => lpDays(r, wd) },
  { header: "Paysheet", value: (r) => r.paysheetSalary },
  { header: "Per day", value: (r) => perDayOf(r, wd) },
  { header: "Total", value: (r) => r.totalEarnings },
  { header: "Days", value: (r) => r.bankDays ?? "" },
  { header: "Salary payable", value: (r) => r.bankGross ?? "" },
  { header: "ADV", value: (r) => r.advance },
  { header: "PT", value: (r) => r.pt },
  { header: "EPF", value: (r) => r.epf },
  { header: "ESI", value: (r) => r.esi },
  { header: "Bank", value: (r) => r.bank ?? r.net },
  { header: "Bank Name", value: (r) => r.bankName },
  { header: "Account number", value: (r) => r.accountNumber },
  { header: "IFSC", value: (r) => r.ifsc },
];

export default function Salaries() {
  const { profile } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState("actual"); // "actual" | "paysheet"
  const [employees, setEmployees] = useState([]);
  const [attMap, setAttMap] = useState({});
  const [entries, setEntries] = useState({});
  const [payroll, setPayroll] = useState(null);
  const [drafts, setDrafts] = useState({}); // employeeId -> { hra, advance, pt } while typing
  const [wdDraft, setWdDraft] = useState(null);
  const [editCell, setEditCell] = useState(null); // { id, k } of the ADV / EPF / ESI cell unlocked by double-click
  const [notice, setNotice] = useState({ type: "", text: "" });

  const fail = (e) => setNotice({ type: "error", text: e.message });

  useEffect(() => listenEmployees(setEmployees, fail), []);
  useEffect(() => {
    if (!month) return undefined;
    setDrafts({}); setWdDraft(null);
    const days = datesOfMonth(month);
    const u1 = listenAttendanceDetails(days[0], days[days.length - 1], setAttMap, fail);
    const u2 = listenEntries(month, setEntries, fail);
    const u3 = listenPayrollMonth(month, setPayroll, fail);
    return () => { u1(); u2(); u3(); };
  }, [month]);

  const finalized = !!payroll?.finalized;
  const workingDays = payroll?.workingDays ?? DEFAULT_WORKING_DAYS;
  // attMap: `${employeeId}_${date}` -> { status, ot }
  const counts = useMemo(() => {
    const statusMap = {};
    Object.entries(attMap).forEach(([k, v]) => { statusMap[k] = v.status; });
    return countsByEmployee(statusMap);
  }, [attMap]);
  // OT hours come from the Attendance page: total of the month's daily OT per employee
  const otByEmp = useMemo(() => {
    const out = {};
    Object.entries(attMap).forEach(([k, v]) => {
      if (!v.status) return; // same as Attendance page: OT counts only on marked days
      const id = k.slice(0, k.lastIndexOf("_"));
      out[id] = (out[id] || 0) + (Number(v.ot) || 0);
    });
    return out;
  }, [attMap]);

  const merged = (id) => ({ ...(entries[id] || {}), ...(drafts[id] || {}) });

  const rows = useMemo(() => {
    if (finalized) return payroll.snapshot || [];
    return employees
      .filter((e) => e.active || (counts[e.id] && Object.values(counts[e.id]).some(Boolean)))
      .map((e) => computeRow({ employee: e, month, counts: counts[e.id], workingDays, entry: { ...(entries[e.id] || {}), ...(drafts[e.id] || {}), otHours: otByEmp[e.id] || 0 } }))
      .sort(byCode);
  }, [employees, counts, otByEmp, entries, drafts, workingDays, finalized, payroll, month]);

  const total = (k) => sumRows(rows, k);

  // ---- editing ----
  const setDraft = (id, k, v) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [k]: v } }));
  const commit = async (id, k) => {
    const v = drafts[id]?.[k];
    if (v === undefined) return;
    try {
      await saveEntry(month, id, { [k]: v === "" ? 0 : Number(v) });
      setDrafts((d) => { const n = { ...d, [id]: { ...d[id] } }; delete n[id][k]; return n; });
    } catch (e) { fail(e); }
  };

  const commitWorkingDays = async () => {
    if (wdDraft === null) return;
    const n = Number(wdDraft);
    setWdDraft(null);
    if (!(n >= 1 && n <= 31)) return setNotice({ type: "error", text: "Working days must be between 1 and 31." });
    try { await savePayrollMonth(month, { workingDays: n }); } catch (e) { fail(e); }
  };

  const finalize = async () => {
    if (!rows.length) return;
    if (!window.confirm(`Finalize ${monthLabel(month)}? The figures are frozen as shown. You can still reopen the month later.`)) return;
    try {
      await savePayrollMonth(month, { workingDays });
      await finalizeMonth(month, rows, profile.name);
      setNotice({ type: "ok", text: `${monthLabel(month)} finalized.` });
    } catch (e) { fail(e); }
  };

  const reopen = async () => {
    if (!window.confirm(`Reopen the finalized ${monthLabel(month)} for editing? Its frozen figures will be recalculated from live data.`)) return;
    try { await reopenMonth(month, profile.name); setNotice({ type: "ok", text: "Month reopened for editing." }); }
    catch (e) { fail(e); }
  };

  const exportCsv = () => downloadCsv(
    `${report === "actual" ? "salaries" : "paysheet"}-${month}.csv`,
    toCsv(rows, report === "actual" ? CSV_COLUMNS(workingDays) : PAYSHEET_CSV_COLUMNS(workingDays)),
  );

  const cellInput = (r, k, placeholder) => {
    if (finalized) return inr(r[k]);
    const live = merged(r.employeeId)[k];
    return (
      <input
        className="cell-input" type="number" min="0" step="0.01" placeholder={placeholder}
        value={live === null || live === undefined ? "" : live}
        onChange={(e) => setDraft(r.employeeId, k, e.target.value)}
        onBlur={() => commit(r.employeeId, k)}
      />
    );
  };

  // ADV / EPF / ESI: double-click to edit
  const dblCell = (r, k) => {
    if (finalized) return inr(r[k]);
    if (editCell && editCell.id === r.employeeId && editCell.k === k) {
      return (
        <input
          className="cell-input" type="number" min="0" step="0.01" autoFocus placeholder="0"
          value={merged(r.employeeId)[k] ?? ""}
          onChange={(e) => setDraft(r.employeeId, k, e.target.value)}
          onBlur={() => { commit(r.employeeId, k); setEditCell(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
      );
    }
    return (
      <span className="adv-cell" title="Double-click to edit" onDoubleClick={() => setEditCell({ id: r.employeeId, k })}>
        {inr(r[k])}
      </span>
    );
  };

  return (
    <div className="page">
      <h1 className="no-print">Salaries</h1>
      {notice.text && <div className={`msg ${notice.type} no-print`}>{notice.text}</div>}

      <div className="toolbar no-print">
        <label className="field">Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="field">Report
          <select value={report} onChange={(e) => setReport(e.target.value)}>
            <option value="actual">Actual salary report</option>
            <option value="paysheet">Paysheet salary report</option>
          </select>
        </label>
        <label className="field">Working days
          <input type="number" min="1" max="31" style={{ width: 100 }} disabled={finalized}
            value={wdDraft ?? workingDays}
            onChange={(e) => setWdDraft(e.target.value)} onBlur={commitWorkingDays} />
        </label>
        {finalized
          ? <button className="btn secondary" onClick={reopen}>Edit finalized month</button>
          : <button className="btn" onClick={finalize} disabled={!rows.length}>Finalize month</button>}
        <button className="btn secondary" onClick={() => window.print()} disabled={!rows.length}>Print paysheet</button>
        <button className="btn secondary" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </div>

      {finalized && (
        <div className="msg warn no-print">
          Finalized{payroll.finalizedBy ? ` by ${payroll.finalizedBy}` : ""}. Figures are frozen; use “Edit finalized month” to change them.
        </div>
      )}
      {!finalized && payroll?.editedAfterFinalize && (
        <div className="msg warn no-print">This month was finalized earlier and reopened by {payroll.reopenedBy || "someone"}. Finalize again when done.</div>
      )}

      {rows.length > 0 && (
        <div className="stats no-print">
          <div className="stat"><div className="label">Employees</div><div className="value">{rows.length}</div></div>
          <div className="stat"><div className="label">Total earnings</div><div className="value">₹{inr(total("totalEarnings"))}</div></div>
          <div className="stat absent"><div className="label">Total deductions</div><div className="value">₹{inr(total("totalDeductions"))}</div></div>
          <div className="stat net"><div className="label">Net payout</div><div className="value">₹{inr(total("net"))}</div></div>
        </div>
      )}

      <h2 className="print-only">{report === "actual" ? "Actual salary report" : "Paysheet salary report"} — {monthLabel(month)} (working days: {workingDays})</h2>

      {report === "actual" ? (
      <div className="table-wrap">
        <table className="data pay">
          <thead>
            <tr>
              <th>Emp ID</th><th>Name</th>
              <th className="num">P</th><th className="num">L</th><th className="num">LP</th>
              <th className="num">Salary</th><th className="num">Paysheet</th>
              <th className="num">OT HRS</th><th className="num">OT AMT</th><th className="num">Days Amt</th>
              <th className="num">Total</th><th className="num">ADV</th>
              <th className="num">PT</th><th className="num">EPF</th><th className="num">ESI</th>
              <th className="num">Bank</th><th className="num">Amt (Cash)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.code}</td><td>{r.name}</td>
                <td className="num">{presentDays(r)}</td>
                <td className="num">{r.leave}</td>
                <td className="num">{lpDays(r, workingDays)}</td>
                <td className="num">{inr(r.gross)}</td>
                <td className="num">{inr(r.paysheetSalary)}</td>
                <td className="num">{inr(r.otHours)}</td>
                <td className="num">{inr(r.otAmt)}</td>
                <td className="num">{inr(r.earned)}</td>
                <td className="num"><strong>{inr(r.totalEarnings)}</strong></td>
                <td className="num">{dblCell(r, "advance")}</td>
                <td className="num">{inr(r.pt)}</td>
                <td className="num">{dblCell(r, "epf")}</td>
                <td className="num">{dblCell(r, "esi")}</td>
                <td className="num"><strong>{inr(r.bank ?? r.net)}</strong></td>
                <td className="num">{inr(r.cash ?? 0)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={17} className="empty">No employees to show for this month yet.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Total ({rows.length})</td>
                <td colSpan={3}></td>
                <td className="num">{inr(total("gross"))}</td>
                <td className="num">{inr(total("paysheetSalary"))}</td>
                <td className="num">{inr(total("otHours"))}</td>
                <td className="num">{inr(total("otAmt"))}</td>
                <td className="num">{inr(total("earned"))}</td>
                <td className="num">{inr(total("totalEarnings"))}</td>
                <td className="num">{inr(total("advance"))}</td>
                <td className="num">{inr(total("pt"))}</td>
                <td className="num">{inr(total("epf"))}</td>
                <td className="num">{inr(total("esi"))}</td>
                <td className="num">{inr(rows.reduce((t, r) => t + (r.bank ?? r.net), 0))}</td>
                <td className="num">{inr(total("cash"))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      ) : (
      <div className="table-wrap">
        <table className="data pay">
          <thead>
            <tr>
              <th>Emp ID</th><th>Name</th>
              <th className="num">P</th><th className="num">L</th><th className="num">LP</th>
              <th className="num">Paysheet</th><th className="num">Per day</th>
              <th className="num">Total</th><th className="num">Days</th><th className="num">Salary payable</th>
              <th className="num">ADV</th><th className="num">PT</th>
              <th className="num">EPF</th><th className="num">ESI</th>
              <th className="num">Bank</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.code}</td><td>{r.name}</td>
                <td className="num">{presentDays(r)}</td>
                <td className="num">{r.leave}</td>
                <td className="num">{lpDays(r, workingDays)}</td>
                <td className="num">{inr(r.paysheetSalary)}</td>
                <td className="num">{inr(perDayOf(r, workingDays))}</td>
                <td className="num"><strong>{inr(r.totalEarnings)}</strong></td>
                <td className="num">{r.bankDays ?? "-"}</td>
                <td className="num">{r.bankGross !== undefined ? inr(r.bankGross) : "-"}</td>
                <td className="num">{dblCell(r, "advance")}</td>
                <td className="num">{inr(r.pt)}</td>
                <td className="num">{dblCell(r, "epf")}</td>
                <td className="num">{dblCell(r, "esi")}</td>
                <td className="num"><strong>{inr(r.bank ?? r.net)}</strong></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={15} className="empty">No employees to show for this month yet.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Total ({rows.length})</td>
                <td colSpan={3}></td>
                <td className="num">{inr(total("paysheetSalary"))}</td>
                <td></td>
                <td className="num">{inr(total("totalEarnings"))}</td>
                <td></td>
                <td className="num">{inr(total("bankGross"))}</td>
                <td className="num">{inr(total("advance"))}</td>
                <td className="num">{inr(total("pt"))}</td>
                <td className="num">{inr(total("epf"))}</td>
                <td className="num">{inr(total("esi"))}</td>
                <td className="num">{inr(rows.reduce((t, r) => t + (r.bank ?? r.net), 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
    </div>
  );
}