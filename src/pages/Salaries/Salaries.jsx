// pages/Salaries/Salaries.jsx
// Monthly payroll sheet. Attendance (from the Attendance page) drives paid days;
// HRA, Advance and PT are editable per row. Finalize locks a snapshot of the month.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenEmployees } from "../../lib/employees";
import { listenAttendance, countsByEmployee } from "../../lib/attendance";
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


const CSV_COLUMNS = (wd) => [
  { header: "Code", value: (r) => r.code },
  { header: "Name of Employee", value: (r) => r.name },
  { header: "Group", value: (r) => r.group },
  { header: "Gross Salary", value: (r) => r.gross },
  { header: "P", value: (r) => presentDays(r) },
  { header: "L", value: (r) => r.leave },
  { header: "LP", value: (r) => lpDays(r, wd) },
  { header: "Paid", value: (r) => r.paidDays },
  { header: "Salary Payable", value: (r) => r.earned },
  { header: "HRA", value: (r) => r.hra },
  { header: "Total Payable", value: (r) => r.totalEarnings },
  { header: "Adv", value: (r) => r.advance },
  { header: "EPF", value: (r) => r.epf },
  { header: "ESI", value: (r) => r.esi },
  { header: "PT", value: (r) => r.pt },
  { header: "Total Deductions", value: (r) => r.totalDeductions },
  { header: "Bank Transfer", value: (r) => r.net },
  { header: "Bank", value: (r) => r.bankName },
  { header: "Account number", value: (r) => r.accountNumber },
  { header: "IFSC", value: (r) => r.ifsc },
];

export default function Salaries() {
  const { profile } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [employees, setEmployees] = useState([]);
  const [attMap, setAttMap] = useState({});
  const [entries, setEntries] = useState({});
  const [payroll, setPayroll] = useState(null);
  const [drafts, setDrafts] = useState({}); // employeeId -> { hra, advance, pt } while typing
  const [wdDraft, setWdDraft] = useState(null);
  const [notice, setNotice] = useState({ type: "", text: "" });

  const fail = (e) => setNotice({ type: "error", text: e.message });

  useEffect(() => listenEmployees(setEmployees, fail), []);
  useEffect(() => {
    if (!month) return undefined;
    setDrafts({}); setWdDraft(null);
    const days = datesOfMonth(month);
    const u1 = listenAttendance(days[0], days[days.length - 1], setAttMap, fail);
    const u2 = listenEntries(month, setEntries, fail);
    const u3 = listenPayrollMonth(month, setPayroll, fail);
    return () => { u1(); u2(); u3(); };
  }, [month]);

  const finalized = !!payroll?.finalized;
  const workingDays = payroll?.workingDays ?? DEFAULT_WORKING_DAYS;
  const counts = useMemo(() => countsByEmployee(attMap), [attMap]);

  const merged = (id) => ({ ...(entries[id] || {}), ...(drafts[id] || {}) });

  const rows = useMemo(() => {
    if (finalized) return payroll.snapshot || [];
    return employees
      .filter((e) => e.active || (counts[e.id] && Object.values(counts[e.id]).some(Boolean)))
      .map((e) => computeRow({ employee: e, month, counts: counts[e.id], workingDays, entry: { ...(entries[e.id] || {}), ...(drafts[e.id] || {}) } }));
  }, [employees, counts, entries, drafts, workingDays, finalized, payroll, month]);

  const total = (k) => sumRows(rows, k);

  // ---- editing ----
  const setDraft = (id, k, v) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [k]: v } }));
  const commit = async (id, k) => {
    const v = drafts[id]?.[k];
    if (v === undefined) return;
    try {
      await saveEntry(month, id, { [k]: k === "pt" && v === "" ? null : v === "" ? 0 : Number(v) });
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

  const exportCsv = () => downloadCsv(`salaries-${month}.csv`, toCsv(rows, CSV_COLUMNS(workingDays)));

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

  return (
    <div className="page">
      <h1 className="no-print">Salaries</h1>
      <p className="sub no-print">P and L come from Attendance (a Half day counts as 0.5 in P). Paid = P + L. LP = working days − P − L.</p>
      {notice.text && <div className={`msg ${notice.type} no-print`}>{notice.text}</div>}

      <div className="toolbar no-print">
        <label className="field">Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
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

      <h2 className="print-only">Paysheet — {monthLabel(month)} (working days: {workingDays})</h2>

      <div className="table-wrap">
        <table className="data pay">
          <thead>
            <tr>
              <th>Code</th><th>Name of Employee</th><th className="num">Gross Salary</th>
              <th className="num">P</th><th className="num">L</th><th className="num">LP</th>
              <th className="num">Paid</th><th className="num">Salary Payable</th>
              <th className="num">HRA</th><th className="num">Total Payable</th>
              <th className="num">Adv</th><th className="num">EPF</th><th className="num">ESI</th>
              <th className="num">PT</th><th className="num">Total Deductions</th><th className="num">Bank Transfer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.code}</td><td>{r.name}</td><td className="num">{inr(r.gross)}</td>
                <td className="num">{presentDays(r)}</td>
                <td className="num">{r.leave}</td>
                <td className="num">{lpDays(r, workingDays)}</td>
                <td className="num">{r.paidDays}</td><td className="num">{inr(r.earned)}</td>
                <td className="num">{cellInput(r, "hra", "0")}</td>
                <td className="num">{inr(r.totalEarnings)}</td>
                <td className="num">{cellInput(r, "advance", "0")}</td>
                <td className="num">{inr(r.epf)}</td><td className="num">{inr(r.esi)}</td>
                <td className="num">
                  {finalized ? inr(r.pt) : (
                    <input className="cell-input" type="number" min="0" step="0.01" placeholder={String(r.pt)}
                      title={r.ptOverridden ? "Overridden — clear to use the slab amount" : "Auto from gross salary slab; type to override"}
                      value={merged(r.employeeId).pt ?? ""}
                      onChange={(e) => setDraft(r.employeeId, "pt", e.target.value)}
                      onBlur={() => commit(r.employeeId, "pt")} />
                  )}
                </td>
                <td className="num">{inr(r.totalDeductions)}</td>
                <td className="num"><strong>{inr(r.net)}</strong></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={16} className="empty">No employees to show for this month yet.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Total ({rows.length})</td>
                <td className="num">{inr(total("gross"))}</td><td colSpan={4}></td>
                <td className="num">{inr(total("earned"))}</td><td className="num">{inr(total("hra"))}</td>
                <td className="num">{inr(total("totalEarnings"))}</td><td className="num">{inr(total("advance"))}</td>
                <td className="num">{inr(total("epf"))}</td><td className="num">{inr(total("esi"))}</td>
                <td className="num">{inr(total("pt"))}</td><td className="num">{inr(total("totalDeductions"))}</td>
                <td className="num">{inr(total("net"))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}