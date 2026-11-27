// pages/Salaries/Salaries.jsx
// Monthly payroll sheet. Attendance (from the Attendance page) drives paid days;
// Advance, EPF and ESI are editable per row. The days box has a Save button; the figures always follow live data.
import { useEffect, useMemo, useState } from "react";
import { listenEmployees } from "../../lib/employees";
import { listenAttendanceDetails, countsByEmployee } from "../../lib/attendance";
import {
  DEFAULT_WORKING_DAYS, PAY_DIVISOR, OT_HOURS_PER_DAY, computeRow, sumRows,
  listenPayrollMonth, listenEntries, saveEntry, savePayrollMonth,
} from "../../lib/payroll";
import { thisMonth, datesOfMonth, daysInMonth, monthLabel } from "../../lib/dates";
import { exportXlsx, exportPdf } from "../../lib/exportFile";
import StaffFilters, { NO_FILTER, matchesFilter } from "../../components/StaffFilters";
import "./Salaries.css";

const inr = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Present shown on the sheet = full days + half of each half day (e.g. 20 + 2 half days = 21)
const presentDays = (r) => r.present + 0.5 * r.halfDay;
// Actual report: LP = days box (defaults to calendar days in the month) - P - L
const lpDays = (r, days) => Math.max(0, days - presentDays(r) - r.leave);
// Paysheet report: P = the paysheet-calculated days (the "Days" value), L = 0,
// LP = paysheet days (26 = month less 4 Sundays; the "Working days" box) - P - L
const paysheetP = (r) => r.bankDays ?? 0;
const paysheetLp = (r, wd) => Math.max(0, wd - paysheetP(r));
// Paysheet report: total deductions = the EPF + ESI + PT columns shown on that sheet
const paysheetDeductions = (r) => (Number(r.epf) || 0) + (Number(r.esi) || 0) + (Number(r.pt) || 0);

// Sort by Emp ID (numeric when possible), then name
const byCode = (a, b) =>
  String(a.code ?? "").localeCompare(String(b.code ?? ""), undefined, { numeric: true }) ||
  String(a.name ?? "").localeCompare(String(b.name ?? ""));

const CSV_COLUMNS = (days) => [
  { header: "Emp ID", value: (r) => r.code },
  { header: "Name", value: (r) => r.name },
  { header: "P", value: (r) => presentDays(r) },
  { header: "L", value: (r) => r.leave },
  { header: "LP", value: (r) => lpDays(r, days) },
  { header: "Salary", value: (r) => r.gross },
  { header: "Days Amt", value: (r) => r.earned },
  { header: "OT HRS", value: (r) => r.otHours },
  { header: "OT AMT", value: (r) => r.otAmt },
  { header: "Total", value: (r) => r.totalEarnings },
  { header: "ADV", value: (r) => r.advance },
  { header: "EPF", value: (r) => r.epf },
  { header: "ESI", value: (r) => r.esi },
  { header: "PT", value: (r) => r.pt },
  { header: "Bank", value: (r) => r.bank ?? r.net },
  { header: "Amt (Cash)", value: (r) => r.cash ?? 0 },
  { header: "Bank Name", value: (r) => r.bankName },
  { header: "Account number", value: (r) => r.accountNumber },
  { header: "IFSC", value: (r) => r.ifsc },
];

// Extra paysheet reports that work exactly like the Paysheet salary report, for another staff category
const STAFF_REPORTS = {
  adminPaysheet: { category: "Admin Staff", title: "Admin salary paysheet", file: "admin-paysheet" },
  fieldPaysheet: { category: "Field Staff", title: "Field salary paysheet", file: "field-paysheet" },
};

// Casuals paysheet: S.No, Name, Rate, Days, OT, D.Amt, OT Amt, Total
const CASUAL_CSV_COLUMNS = [
  { header: "S.No", value: (r) => r.sno },
  { header: "Name", value: (r) => r.name },
  { header: "Rate", value: (r) => r.rate },
  { header: "Days", value: (r) => r.days },
  { header: "OT", value: (r) => r.ot },
  { header: "D.Amt", value: (r) => r.dAmt },
  { header: "OT Amt", value: (r) => r.otAmt },
  { header: "Total", value: (r) => r.total },
];

// Directors paysheet: S.No, Name, Income, TDS
const DIRECTOR_CSV_COLUMNS = [
  { header: "S.No", value: (r) => r.sno },
  { header: "Name", value: (r) => r.name },
  { header: "Income", value: (r) => r.income },
  { header: "TDS", value: (r) => r.tds },
  { header: "Total", value: (r) => r.total },
];

const PAYSHEET_CSV_COLUMNS = (wd) => [
  { header: "Emp ID", value: (r) => r.code },
  { header: "Name", value: (r) => r.name },
  { header: "P", value: (r) => paysheetP(r) },
  { header: "L", value: () => 0 },
  { header: "LP", value: (r) => paysheetLp(r, wd) },
  { header: "Paysheet salary", value: (r) => r.paysheetSalary },
  { header: "Salary payable", value: (r) => r.bankGross ?? "" },
  { header: "EPF", value: (r) => r.epf },
  { header: "ESI", value: (r) => r.esi },
  { header: "PT", value: (r) => r.pt },
  { header: "Total deductions", value: (r) => paysheetDeductions(r) },
  { header: "Bank transfer", value: (r) => r.bank ?? r.net },
  { header: "Bank Name", value: (r) => r.bankName },
  { header: "Account number", value: (r) => r.accountNumber },
  { header: "IFSC", value: (r) => r.ifsc },
];

export default function Salaries() {
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState("actual"); // "actual" | "paysheet" | "adminPaysheet" | "fieldPaysheet" | "casuals" | "directors"
  const [allEmployees, setAllEmployees] = useState([]);
  const [filters, setFilters] = useState(NO_FILTER); // Group / Unit / Category
  const [attMap, setAttMap] = useState({});
  const [entries, setEntries] = useState({});
  const [payroll, setPayroll] = useState(null);
  const [drafts, setDrafts] = useState({}); // employeeId -> { hra, advance, pt } while typing
  const [wdDraft, setWdDraft] = useState(null);
  const [editCell, setEditCell] = useState(null); // { id, k } of the ADV / EPF / ESI cell unlocked by double-click
  const [notice, setNotice] = useState({ type: "", text: "" });

  const fail = (e) => setNotice({ type: "error", text: e.message });

  useEffect(() => listenEmployees(setAllEmployees, fail), []);
  const employees = useMemo(() => allEmployees.filter((e) => matchesFilter(e, filters)), [allEmployees, filters]);
  useEffect(() => {
    if (!month) return undefined;
    setDrafts({}); setWdDraft(null);
    const days = datesOfMonth(month);
    const u1 = listenAttendanceDetails(days[0], days[days.length - 1], setAttMap, fail);
    const u2 = listenEntries(month, setEntries, fail);
    const u3 = listenPayrollMonth(month, setPayroll, fail);
    return () => { u1(); u2(); u3(); };
  }, [month]);

  // Two separate day counts, each saved on the month's payroll record:
  //   actualDays  - Actual report, defaults to the calendar days of the month (30 / 31 ...)
  //   paysheetDays - Paysheet report, defaults to 26 (month less 4 Sundays); also drives the bank / cash split
  // (an old "workingDays" value saved on the month is deliberately ignored, so each report starts from its own default)
  const monthDays = daysInMonth(month);
  const workingDays = payroll?.paysheetDays ?? DEFAULT_WORKING_DAYS;
  const actualDays = payroll?.actualDays ?? monthDays;
  const isActual = report === "actual";
  const isCasuals = report === "casuals";
  const isDirectors = report === "directors";
  const separate = isCasuals || isDirectors; // these two reports have their own tables, no days box
  const shownDays = isActual ? actualDays : workingDays;
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

  // Actual and Paysheet salary reports list Workers; the Admin / Field salary paysheets list Admin Staff / Field Staff (same paysheet logic)
  const staffCategory = STAFF_REPORTS[report]?.category || "Workers";
  const rows = useMemo(() => {
    return employees
      .filter((e) => e.category === staffCategory)
      .filter((e) => e.active || (counts[e.id] && Object.values(counts[e.id]).some(Boolean)))
      .map((e) => computeRow({ employee: e, month, counts: counts[e.id], workingDays, payDays: actualDays, entry: { ...(entries[e.id] || {}), ...(drafts[e.id] || {}), otHours: otByEmp[e.id] || 0 } }))
      .sort(byCode);
  }, [employees, counts, otByEmp, entries, drafts, workingDays, actualDays, month, staffCategory]);

  const total = (k) => sumRows(rows, k);

  // ---- Casuals paysheet ----
  //   Rate   = what was entered on the employee: the day salary, or the monthly salary
  //   Days   = Present (a half day counts as 0.5); Leave and Holiday are not counted
  //   OT     = OT hours: typed here (double-click), otherwise the OT hours from Attendance
  //   D.Amt  = day rate x Days        OT Amt = day rate / 8 x OT      Total = D.Amt + OT Amt, rounded to the nearest 10 (6,405 -> 6,410, 6,404 -> 6,400)
  //            (day rate = Rate, or Rate / 30 when the Rate is a monthly salary)
  const casualRows = useMemo(() => (
    employees
      .filter((e) => e.category === "Casuals" && (e.active || (counts[e.id] && Object.values(counts[e.id]).some(Boolean))))
      .sort(byCode)
      .map((e, i) => {
        const c = counts[e.id] || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
        const m = { ...(entries[e.id] || {}), ...(drafts[e.id] || {}) };
        const isDaily = Number(e.daySalary) > 0;
        const rate = isDaily ? Number(e.daySalary) : (Number(e.monthlySalary) > 0 ? Number(e.monthlySalary) : Number(e.grossSalary) || 0);
        // amounts are worked out per day: a monthly rate is divided by 30
        const dayRate = isDaily ? rate : rate / PAY_DIVISOR;
        const days = c.Present + 0.5 * c["Half day"];
        const ot = m.casualOt !== undefined && m.casualOt !== "" ? Number(m.casualOt) || 0 : (otByEmp[e.id] || 0);
        const dAmt = Math.round(dayRate * days);
        const otAmt = Math.round((dayRate / OT_HOURS_PER_DAY) * ot);
        return { employeeId: e.id, sno: i + 1, name: e.name, rate, days, ot, dAmt, otAmt, total: Math.round((dAmt + otAmt) / 10) * 10 };
      })
  ), [employees, counts, otByEmp, entries, drafts]);
  const casualTotal = (k) => sumRows(casualRows, k);

  // ---- Directors paysheet ---- (no attendance, no OT)
  //   Income = the salary entered on the employee      TDS = typed here (double-click), saved per month (a deduction)
  //   Total  = Income - TDS
  const directorRows = useMemo(() => (
    employees
      .filter((e) => e.category === "Directors" && e.active)
      .sort(byCode)
      .map((e, i) => {
        const m = { ...(entries[e.id] || {}), ...(drafts[e.id] || {}) };
        return { employeeId: e.id, sno: i + 1, name: e.name, income: Number(e.grossSalary) || 0, tds: Number(m.tds) || 0 };
      })
      .map((r) => {
        return { ...r, total: r.income - r.tds };
      })
  ), [employees, entries, drafts]);
  const directorTotal = (k) => sumRows(directorRows, k);

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

  // Save button: saves the days box for the selected report (Days in month for Actual, Working days for Paysheet)
  const saveDays = async () => {
    if (wdDraft === null) return;
    const n = Number(wdDraft);
    if (!(n >= 1 && n <= 31)) return setNotice({ type: "error", text: "Days must be between 1 and 31." });
    try {
      await savePayrollMonth(month, { [isActual ? "actualDays" : "paysheetDays"]: n });
      setWdDraft(null);
      setNotice({ type: "ok", text: `${isActual ? "Days in month" : "Working days"} saved for ${monthLabel(month)}.` });
    } catch (e) { fail(e); }
  };

  // What the Excel / PDF exports contain for the selected report
  const exportInfo = () => {
    const name = isDirectors ? "directors-paysheet" : isCasuals ? "casuals-paysheet" : STAFF_REPORTS[report] ? STAFF_REPORTS[report].file : report === "actual" ? "salaries" : "paysheet";
    const title = isDirectors ? "Directors paysheet" : isCasuals ? "Casuals paysheet" : STAFF_REPORTS[report] ? STAFF_REPORTS[report].title : report === "actual" ? "Actual salary report" : "Paysheet salary report";
    const columns = isDirectors ? DIRECTOR_CSV_COLUMNS : isCasuals ? CASUAL_CSV_COLUMNS
      : report === "actual" ? CSV_COLUMNS(actualDays) : PAYSHEET_CSV_COLUMNS(workingDays);
    const data = isDirectors ? directorRows : isCasuals ? casualRows : rows;
    return { name, opts: { title, monthText: monthLabel(month), columns, rows: data } };
  };
  const exportExcel = async () => {
    const { name, opts } = exportInfo();
    try { await exportXlsx(opts, `${name}-${month}.xlsx`); } catch (e) { fail(e); }
  };
  const downloadPdf = async () => {
    const { name, opts } = exportInfo();
    try { await exportPdf(opts, `${name}-${month}.pdf`); } catch (e) { fail(e); }
  };

  // Casuals OT cell: double-click to edit
  const casualOtCell = (r) => {
    if (editCell && editCell.id === r.employeeId && editCell.k === "casualOt") {
      return (
        <input
          className="cell-input" type="number" min="0" step="0.5" autoFocus placeholder="0"
          value={drafts[r.employeeId]?.casualOt ?? r.ot}
          onChange={(e) => setDraft(r.employeeId, "casualOt", e.target.value)}
          onBlur={() => { commit(r.employeeId, "casualOt"); setEditCell(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
      );
    }
    return (
      <span className="adv-cell" title="Double-click to edit" onDoubleClick={() => setEditCell({ id: r.employeeId, k: "casualOt" })}>
        {inr(r.ot)}
      </span>
    );
  };

  const cellInput = (r, k, placeholder) => {
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
          <select value={report} onChange={(e) => { setReport(e.target.value); setWdDraft(null); }}>
            <option value="actual">Actual salary report</option>
            <option value="paysheet">Paysheet salary report</option>
            <option value="adminPaysheet">Admin salary paysheet</option>
            <option value="fieldPaysheet">Field salary paysheet</option>
            <option value="casuals">Casuals paysheet</option>
            <option value="directors">Directors paysheet</option>
          </select>
        </label>
        <StaffFilters employees={allEmployees} value={filters} onChange={setFilters} />
        {!separate && (
          <label className="field">{isActual ? "Days in month" : "Working days"}
            <input type="number" min="1" max="31" style={{ width: 100 }}
              value={wdDraft ?? shownDays}
              onChange={(e) => setWdDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveDays(); }} />
          </label>
        )}
        {!separate && <button className="btn" onClick={saveDays} disabled={wdDraft === null}>Save</button>}
        <button className="btn secondary" onClick={downloadPdf} disabled={!(isDirectors ? directorRows : isCasuals ? casualRows : rows).length}>Download PDF</button>
        <button className="btn secondary" onClick={exportExcel} disabled={!(isDirectors ? directorRows : isCasuals ? casualRows : rows).length}>Export Excel</button>
      </div>

      {!separate && rows.length > 0 && (
        <div className="stats no-print">
          <div className="stat"><div className="label">Employees</div><div className="value">{rows.length}</div></div>
          <div className="stat"><div className="label">Total earnings</div><div className="value">₹{inr(total("totalEarnings"))}</div></div>
          <div className="stat absent"><div className="label">Total deductions</div><div className="value">₹{inr(total("totalDeductions"))}</div></div>
          <div className="stat net"><div className="label">Net payout</div><div className="value">₹{inr(total("net"))}</div></div>
        </div>
      )}

      <h2 className="print-only">{isDirectors ? `Directors paysheet — ${monthLabel(month)}` : isCasuals ? `Casuals paysheet — ${monthLabel(month)}` : `${report === "actual" ? "Actual salary report" : STAFF_REPORTS[report] ? STAFF_REPORTS[report].title : "Paysheet salary report"} — ${monthLabel(month)} (${isActual ? "days" : "working days"}: ${shownDays})`}</h2>

      {isDirectors ? (
      <div className="table-wrap">
        <table className="data pay">
          <thead>
            <tr>
              <th>S.No</th><th>Name</th>
              <th className="num">Income</th><th className="num">TDS</th><th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {directorRows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.sno}</td><td>{r.name}</td>
                <td className="num">{inr(r.income)}</td>
                <td className="num">{dblCell(r, "tds")}</td>
                <td className="num"><strong>{inr(r.total)}</strong></td>
              </tr>
            ))}
            {directorRows.length === 0 && <tr><td colSpan={5} className="empty">No directors to show yet.</td></tr>}
          </tbody>
          {directorRows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Total ({directorRows.length})</td>
                <td className="num">{inr(directorTotal("income"))}</td>
                <td className="num">{inr(directorTotal("tds"))}</td>
                <td className="num">{inr(directorTotal("total"))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      ) : isCasuals ? (
      <div className="table-wrap">
        <table className="data pay">
          <thead>
            <tr>
              <th>S.No</th><th>Name</th>
              <th className="num">Rate</th><th className="num">Days</th><th className="num">OT</th>
              <th className="num">D.Amt</th><th className="num">OT Amt</th><th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {casualRows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.sno}</td><td>{r.name}</td>
                <td className="num">{inr(r.rate)}</td>
                <td className="num">{inr(r.days)}</td>
                <td className="num">{casualOtCell(r)}</td>
                <td className="num">{inr(r.dAmt)}</td>
                <td className="num">{inr(r.otAmt)}</td>
                <td className="num"><strong>{inr(r.total)}</strong></td>
              </tr>
            ))}
            {casualRows.length === 0 && <tr><td colSpan={8} className="empty">No casual employees to show for this month yet.</td></tr>}
          </tbody>
          {casualRows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3}>Total ({casualRows.length})</td>
                <td className="num">{inr(casualTotal("days"))}</td>
                <td className="num">{inr(casualTotal("ot"))}</td>
                <td className="num">{inr(casualTotal("dAmt"))}</td>
                <td className="num">{inr(casualTotal("otAmt"))}</td>
                <td className="num">{inr(casualTotal("total"))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      ) : report === "actual" ? (
      <div className="table-wrap">
        <table className="data pay">
          <thead>
            <tr>
              <th>Emp ID</th><th>Name</th>
              <th className="num">P</th><th className="num">L</th><th className="num">LP</th>
              <th className="num">Salary</th><th className="num">Days Amt</th>
              <th className="num">OT HRS</th><th className="num">OT AMT</th>
              <th className="num">Total</th><th className="num">ADV</th>
              <th className="num">EPF</th><th className="num">ESI</th><th className="num">PT</th>
              <th className="num">Bank</th><th className="num">Amt (Cash)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.code}</td><td>{r.name}</td>
                <td className="num">{presentDays(r)}</td>
                <td className="num">{r.leave}</td>
                <td className="num">{lpDays(r, actualDays)}</td>
                <td className="num">{inr(r.gross)}</td>
                <td className="num">{inr(r.earned)}</td>
                <td className="num">{inr(r.otHours)}</td>
                <td className="num">{inr(r.otAmt)}</td>
                <td className="num"><strong>{inr(r.totalEarnings)}</strong></td>
                <td className="num">{dblCell(r, "advance")}</td>
                <td className="num">{inr(r.epf)}</td>
                <td className="num">{inr(r.esi)}</td>
                <td className="num">{inr(r.pt)}</td>
                <td className="num"><strong>{inr(r.bank ?? r.net)}</strong></td>
                <td className="num">{inr(r.cash ?? 0)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={16} className="empty">No employees to show for this month yet.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Total ({rows.length})</td>
                <td colSpan={3}></td>
                <td className="num">{inr(total("gross"))}</td>
                <td className="num">{inr(total("earned"))}</td>
                <td className="num">{inr(total("otHours"))}</td>
                <td className="num">{inr(total("otAmt"))}</td>
                <td className="num">{inr(total("totalEarnings"))}</td>
                <td className="num">{inr(total("advance"))}</td>
                <td className="num">{inr(total("epf"))}</td>
                <td className="num">{inr(total("esi"))}</td>
                <td className="num">{inr(total("pt"))}</td>
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
              <th className="num">Paysheet salary</th><th className="num">Salary payable</th>
              <th className="num">EPF</th><th className="num">ESI</th><th className="num">PT</th>
              <th className="num">Total deductions</th>
              <th className="num">Bank transfer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.code}</td><td>{r.name}</td>
                <td className="num">{paysheetP(r)}</td>
                <td className="num">0</td>
                <td className="num">{paysheetLp(r, workingDays)}</td>
                <td className="num">{inr(r.paysheetSalary)}</td>
                <td className="num">{r.bankGross !== undefined ? inr(r.bankGross) : "-"}</td>
                <td className="num">{inr(r.epf)}</td>
                <td className="num">{inr(r.esi)}</td>
                <td className="num">{inr(r.pt)}</td>
                <td className="num">{inr(paysheetDeductions(r))}</td>
                <td className="num"><strong>{inr(r.bank ?? r.net)}</strong></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="empty">No employees to show for this month yet.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>Total ({rows.length})</td>
                <td colSpan={3}></td>
                <td className="num">{inr(total("paysheetSalary"))}</td>
                <td className="num">{inr(total("bankGross"))}</td>
                <td className="num">{inr(total("epf"))}</td>
                <td className="num">{inr(total("esi"))}</td>
                <td className="num">{inr(total("pt"))}</td>
                <td className="num">{inr(rows.reduce((t, r) => t + paysheetDeductions(r), 0))}</td>
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