// Employee view: pick ONE employee, then mark any day of a month for them.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenAttendance, setAttendance, countsByEmployee, STATUSES } from "../../lib/attendance";
import { thisMonth, datesOfMonth, monthLabel, dayLabel, todayStr } from "../../lib/dates";

export default function EmployeeView({ employees }) {
  const { profile } = useAuth();
  const [empId, setEmpId] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [map, setMap] = useState({});
  const [error, setError] = useState("");
  const [busyDate, setBusyDate] = useState(null);

  const active = useMemo(() => employees.filter((e) => e.active), [employees]);
  const emp = employees.find((e) => e.id === empId);

  useEffect(() => {
    if (!month) return undefined;
    const days = datesOfMonth(month);
    return listenAttendance(days[0], days[days.length - 1], setMap, (e) => setError(e.message));
  }, [month]);

  const days = month ? datesOfMonth(month) : [];
  const counts = (emp && countsByEmployee(map)[emp.id]) || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
  const today = todayStr();

  const mark = async (date, status) => {
    setBusyDate(date); setError("");
    try { await setAttendance(emp.id, date, status, profile.name); }
    catch (e) { setError(e.message); }
    finally { setBusyDate(null); }
  };

  return (
    <>
      <div className="toolbar">
        <label className="field">Employee
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ minWidth: 240 }}>
            <option value="">Select an employee…</option>
            {active.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
          </select>
        </label>
        <label className="field">Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {error && <div className="msg error">{error}</div>}

      {!emp ? (
        <div className="msg warn">Choose an employee to mark their attendance.</div>
      ) : (
        <>
          <p className="sub">{emp.name}{emp.group ? `, ${emp.group}` : ""} — {monthLabel(month)}</p>
          <div className="stats">
            <div className="stat present"><div className="label">Present</div><div className="value">{counts.Present}</div></div>
            <div className="stat half"><div className="label">Half day</div><div className="value">{counts["Half day"]}</div></div>
            <div className="stat leave"><div className="label">Leave</div><div className="value">{counts.Leave}</div></div>
            <div className="stat absent"><div className="label">Absent</div><div className="value">{counts.Absent}</div></div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {days.map((d) => {
                  const cur = map[`${emp.id}_${d}`];
                  return (
                    <tr key={d} className={d === today ? "today-row" : ""}>
                      <td>{dayLabel(d)}{d === today && <> <span className="badge amber">Today</span></>}</td>
                      <td>
                        <div className="seg">
                          {STATUSES.map((s) => (
                            <button key={s} disabled={busyDate === d}
                              className={`seg-btn ${cur === s ? "on " + s.replace(" ", "") : ""}`}
                              onClick={() => mark(d, s)}>{s}</button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}