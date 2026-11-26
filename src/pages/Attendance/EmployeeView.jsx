// Employee view: pick ONE employee, then mark any day in a From–To range for them.
// Workers and Casuals also get an OT (hours) box for each day.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenAttendanceDetails, setAttendance, setOvertime, STATUSES } from "../../lib/attendance";
import { thisMonth, datesOfMonth, dayLabel, todayStr } from "../../lib/dates";

const MAX_DAYS = 92;
const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// from..to inclusive ([] if either is empty or from > to)
function datesBetween(from, to) {
  if (!from || !to || from > to) return [];
  const [y, m, d] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const end = new Date(y2, m2 - 1, d2);
  const out = [];
  for (let t = new Date(y, m - 1, d); t <= end && out.length <= MAX_DAYS; t.setDate(t.getDate() + 1)) out.push(fmt(t));
  return out;
}

const monthDays = datesOfMonth(thisMonth());

export default function EmployeeView({ employees }) {
  const { profile } = useAuth();
  const [empId, setEmpId] = useState("");
  const [from, setFrom] = useState(monthDays[0]);
  const [to, setTo] = useState(monthDays[monthDays.length - 1]);
  const [map, setMap] = useState({});
  const [otDraft, setOtDraft] = useState({}); // date -> text being typed
  const [error, setError] = useState("");
  const [busyDate, setBusyDate] = useState(null);

  const active = useMemo(() => employees.filter((e) => e.active), [employees]);
  const emp = employees.find((e) => e.id === empId);
  const worker = emp?.category === "Workers" || emp?.category === "Casuals"; // gets an OT box

  const days = useMemo(() => datesBetween(from, to), [from, to]);
  const tooLong = days.length > MAX_DAYS;

  useEffect(() => {
    setOtDraft({});
    if (!days.length || tooLong) { setMap({}); return undefined; }
    return listenAttendanceDetails(days[0], days[days.length - 1], setMap, (e) => setError(e.message));
  }, [days, tooLong]);

  const rec = (d) => (emp ? map[`${emp.id}_${d}`] : undefined);
  const counts = { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
  let otTotal = 0;
  if (emp) {
    for (const d of days) {
      const r = rec(d);
      if (r?.status in counts) counts[r.status] += 1;
      if (r?.status) otTotal += r.ot || 0;
    }
  }
  const today = todayStr();

  // From can never be after To
  const changeFrom = (v) => { setFrom(v); if (v && to && v > to) setTo(v); };
  const changeTo = (v) => { setTo(v); if (v && from && v < from) setFrom(v); };

  const mark = async (date, status) => {
    setBusyDate(date); setError("");
    try { await setAttendance(emp.id, date, status, profile.name); }
    catch (e) { setError(e.message); }
    finally { setBusyDate(null); }
  };

  const saveOt = async (date) => {
    const draft = otDraft[date];
    if (draft === undefined) return;
    const hours = draft === "" ? 0 : Number(draft);
    if (!Number.isFinite(hours) || hours < 0) return setError("OT hours must be 0 or more.");
    if (!rec(date)?.status) return setError(`Mark the status for ${dayLabel(date)} first, then enter OT.`);
    setError("");
    setOtDraft(({ [date]: _gone, ...rest }) => rest);
    try { await setOvertime(emp.id, date, hours, profile.name); }
    catch (e) { setError(e.message); }
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
        <label className="field">From date
          <input type="date" value={from} onChange={(e) => changeFrom(e.target.value)} />
        </label>
        <label className="field">To date
          <input type="date" value={to} min={from} onChange={(e) => changeTo(e.target.value)} />
        </label>
      </div>
      {tooLong && <div className="msg error">Please pick a range of up to {MAX_DAYS} days.</div>}
      {error && <div className="msg error">{error}</div>}

      {!emp ? (
        <div className="msg warn">Choose an employee to mark their attendance.</div>
      ) : (
        <>
          <p className="sub">
            {emp.name}{emp.group ? `, ${emp.group}` : ""}
            {days.length > 0 && !tooLong && <> — {dayLabel(days[0])}{days.length > 1 && <> to {dayLabel(days[days.length - 1])}</>} · {days.length} day{days.length > 1 ? "s" : ""}</>}
          </p>
          <div className="stats">
            <div className="stat present"><div className="label">Present</div><div className="value">{counts.Present}</div></div>
            <div className="stat half"><div className="label">Half day</div><div className="value">{counts["Half day"]}</div></div>
            <div className="stat leave"><div className="label">Leave</div><div className="value">{counts.Leave}</div></div>
            <div className="stat absent"><div className="label">Absent</div><div className="value">{counts.Absent}</div></div>
            {worker && <div className="stat"><div className="label">OT hours</div><div className="value">{otTotal}</div></div>}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>Status</th>{worker && <th>OT (hrs)</th>}</tr></thead>
              <tbody>
                {!tooLong && days.map((d) => {
                  const r = rec(d);
                  const cur = r?.status;
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
                      {worker && (
                        <td>
                          <input
                            type="number" min="0" step="0.5" style={{ width: 90 }}
                            value={otDraft[d] ?? (r?.ot ? String(r.ot) : "")}
                            placeholder="0"
                            onChange={(ev) => setOtDraft({ ...otDraft, [d]: ev.target.value })}
                            onBlur={() => saveOt(d)}
                            onKeyDown={(ev) => { if (ev.key === "Enter") ev.target.blur(); }}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
                {days.length === 0 && <tr><td colSpan={worker ? 3 : 2} className="empty">Pick a valid From and To date.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}