// pages/Payslip/Payslip.jsx — pick a month and an employee name, get that month's payslip.
import { useEffect, useMemo, useState } from "react";
import { listenEmployees } from "../../lib/employees";
import { listenAttendanceDetails, countsByEmployee } from "../../lib/attendance";
import { listenEntries, listenPayrollMonth, DEFAULT_WORKING_DAYS } from "../../lib/payroll";
import { buildPayslip } from "../../lib/payslip";
import { thisMonth, datesOfMonth, daysInMonth, monthLabel } from "../../lib/dates";
import "./Payslip.css";

const inr = (n) => Number(n || 0).toLocaleString("en-IN");

export default function Payslip() {
  const [month, setMonth] = useState(thisMonth());
  const [employees, setEmployees] = useState([]);
  const [empId, setEmpId] = useState("");
  const [attMap, setAttMap] = useState({});
  const [entries, setEntries] = useState({});
  const [payroll, setPayroll] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => listenEmployees(setEmployees, (e) => setError(e.message)), []);
  useEffect(() => {
    if (!month) return undefined;
    const days = datesOfMonth(month);
    const u1 = listenAttendanceDetails(days[0], days[days.length - 1], setAttMap, (e) => setError(e.message));
    const u2 = listenEntries(month, setEntries, (e) => setError(e.message));
    const u3 = listenPayrollMonth(month, setPayroll, (e) => setError(e.message));
    return () => { u1(); u2(); u3(); };
  }, [month]);

  const emp = employees.find((e) => e.id === empId);

  const slip = useMemo(() => {
    if (!emp) return null;
    const statusMap = {};
    let otHours = 0;
    Object.entries(attMap).forEach(([k, v]) => {
      if (!k.startsWith(`${emp.id}_`)) return;
      statusMap[k] = v.status;
      if (v.status) otHours += Number(v.ot) || 0;
    });
    const counts = countsByEmployee(statusMap)[emp.id];
    const snapshotRow = payroll?.finalized ? (payroll.snapshot || []).find((r) => r.employeeId === emp.id) : undefined;
    return buildPayslip({
      employee: emp, counts, otHours, entry: entries[emp.id],
      workingDays: payroll?.paysheetDays ?? DEFAULT_WORKING_DAYS,
      actualDays: payroll?.actualDays ?? daysInMonth(month),
      snapshotRow,
    });
  }, [emp, attMap, entries, payroll, month]);

  return (
    <div className="page">
      <h1 className="no-print">Payslip</h1>
      {error && <div className="msg error no-print">{error}</div>}

      <div className="toolbar no-print">
        <label className="field">Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label className="field">Employee name
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ minWidth: 260 }}>
            <option value="">Select an employee…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
          </select>
        </label>
        <button className="btn secondary" onClick={() => window.print()} disabled={!slip}>Print payslip</button>
      </div>

      {!slip ? (
        <div className="msg warn no-print">Choose an employee to see the payslip.</div>
      ) : (
        <div className="slip">
          <h2>Payslip</h2>
          <div className="slip-month">{monthLabel(month)}</div>
          <div className="slip-info">
            <div><span>Name: </span><strong>{emp.name}</strong></div>
            <div><span>Employee ID: </span><strong>{emp.code}</strong></div>
            <div><span>Designation: </span>{emp.designation || "—"}</div>
            <div><span>Category: </span>{emp.category || "—"}</div>
            {slip.daysLabel && <div><span>Days paid: </span>{slip.daysLabel}</div>}
          </div>

          <div className="slip-cols">
            <table>
              <thead><tr><th>Earnings</th><th className="amt">₹</th></tr></thead>
              <tbody>
                {slip.earnings.map((l) => <tr key={l.label}><td>{l.label}</td><td className="amt">{inr(l.amount)}</td></tr>)}
              </tbody>
              <tfoot><tr><td>Total earnings</td><td className="amt">{inr(slip.gross)}</td></tr></tfoot>
            </table>
            <table>
              <thead><tr><th>Deductions</th><th className="amt">₹</th></tr></thead>
              <tbody>
                {slip.deductions.length === 0 && <tr><td>None</td><td className="amt">0</td></tr>}
                {slip.deductions.map((l) => <tr key={l.label}><td>{l.label}</td><td className="amt">{inr(l.amount)}</td></tr>)}
              </tbody>
              <tfoot><tr><td>Total deductions</td><td className="amt">{inr(slip.totalDeductions)}</td></tr></tfoot>
            </table>
          </div>

          <div className="slip-net"><span>Net pay</span><span>₹{inr(slip.net)}</span></div>
        </div>
      )}
    </div>
  );
}
