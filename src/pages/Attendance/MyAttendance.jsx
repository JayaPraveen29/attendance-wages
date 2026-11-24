// Employee view: own attendance only + "Mark me present" for TODAY.
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenAttendance, setAttendance, countsByEmployee, STATUS_BADGE } from "../../lib/attendance";
import { todayStr, thisMonth, datesOfMonth, monthLabel, dayLabel } from "../../lib/dates";

export default function MyAttendance({ employees }) {
  const { profile } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [map, setMap] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Own employee record = the one with the same email as this login.
  const me = employees.find((e) => (e.email || "").toLowerCase() === (profile.email || "").toLowerCase());

  useEffect(() => {
    if (!month) return undefined;
    const days = datesOfMonth(month);
    return listenAttendance(days[0], days[days.length - 1], setMap, (e) => setError(e.message));
  }, [month]);

  if (!me) {
    return (
      <div className="msg warn">
        No employee record is linked to your email ({profile.email}). Ask a Director or Admin to create one with this same email.
      </div>
    );
  }

  const today = todayStr();
  const todayStatus = map[`${me.id}_${today}`];
  const counts = countsByEmployee(map)[me.id] || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
  const days = month ? datesOfMonth(month) : [];

  const markToday = async () => {
    setBusy(true); setError("");
    try { await setAttendance(me.id, today, "Present", profile.name); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="card">
        <strong>{me.name}</strong> · {me.code}{me.group ? ` · ${me.group}` : ""}
        <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <button className="btn" disabled={busy || todayStatus === "Present" || !me.active} onClick={markToday}>
            {todayStatus === "Present" ? "Marked present today ✓" : "Mark me present today"}
          </button>
          <span className="sub" style={{ margin: 0 }}>
            {dayLabel(today)}{todayStatus && todayStatus !== "Present" ? ` — currently ${todayStatus}` : ""}
          </span>
        </div>
      </div>

      {error && <div className="msg error">{error}</div>}

      <div className="toolbar">
        <label className="field">Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {month && (
        <p className="sub">
          {monthLabel(month)} — Present {counts.Present} · Half day {counts["Half day"]} · Leave {counts.Leave} · Absent {counts.Absent}
        </p>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {days.map((d) => {
              const s = map[`${me.id}_${d}`];
              return (
                <tr key={d}>
                  <td>{dayLabel(d)}</td>
                  <td>{s ? <span className={`badge ${STATUS_BADGE[s]}`}>{s}</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
