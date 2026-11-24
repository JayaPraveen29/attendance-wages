// Day view: pick a date, tap a status for each active employee.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenAttendance, setAttendance, STATUSES } from "../../lib/attendance";
import { todayStr, dayLabel } from "../../lib/dates";

export default function DayView({ employees }) {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [map, setMap] = useState({});
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(
    () => (date ? listenAttendance(date, date, setMap, (e) => setError(e.message)) : undefined),
    [date]
  );

  const active = useMemo(() => employees.filter((e) => e.active), [employees]);

  const mark = async (emp, status) => {
    setBusyId(emp.id);
    setError("");
    try { await setAttendance(emp.id, date, status, profile.name); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const markAll = async (status) => {
    const todo = active.filter((e) => !map[`${e.id}_${date}`]);
    if (!todo.length) return;
    if (!window.confirm(`Mark ${todo.length} unmarked employee(s) as ${status}?`)) return;
    for (const e of todo) await mark(e, status);
  };

  const summary = STATUSES.map((s) => [s, active.filter((e) => map[`${e.id}_${date}`] === s).length]);
  const unmarked = active.filter((e) => !map[`${e.id}_${date}`]).length;

  return (
    <>
      <div className="toolbar">
        <label className="field">Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn secondary" onClick={() => setDate(todayStr())}>Today</button>
        <button className="btn secondary" onClick={() => markAll("Present")}>Mark all unmarked Present</button>
      </div>
      {date && <p className="sub">{dayLabel(date)}</p>}
      <div className="stats">
        {summary.map(([s, n]) => (
          <div key={s} className={`stat ${{ Present: "present", "Half day": "half", Leave: "leave", Absent: "absent" }[s]}`}>
            <div className="label">{s}</div><div className="value">{n}</div>
          </div>
        ))}
        <div className="stat"><div className="label">Not marked yet</div><div className="value">{unmarked}</div></div>
      </div>
      {error && <div className="msg error">{error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Code</th><th>Name</th><th>Group</th><th>Status</th></tr></thead>
          <tbody>
            {active.map((e) => {
              const cur = map[`${e.id}_${date}`];
              return (
                <tr key={e.id}>
                  <td>{e.code}</td><td>{e.name}</td><td>{e.group}</td>
                  <td>
                    <div className="seg">
                      {STATUSES.map((s) => (
                        <button key={s} disabled={busyId === e.id}
                          className={`seg-btn ${cur === s ? "on " + s.replace(" ", "") : ""}`}
                          onClick={() => mark(e, s)}>{s}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {active.length === 0 && <tr><td colSpan={4} className="empty">No active employees yet. Add one under Create employee.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
