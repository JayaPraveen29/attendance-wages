// Day view: pick a date (or a From–To range), tap a status for each active employee.
// Workers and Casuals also get an OT (hours) box. With a range, the status / OT you set is applied to every day in it.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenAttendanceDetails, setAttendance, setOvertime, clearAttendance, STATUSES, HD_LEAVE, LEAVE_SANCTIONED, statusesFor, statusLabel, usesLeaveSanctioned } from "../../lib/attendance";
import { todayStr, dayLabel } from "../../lib/dates";

const MAX_DAYS = 62;
const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ["2026-11-01", ..., "2026-11-05"] for from..to inclusive ([] if either is empty or from > to)
function datesBetween(from, to) {
  if (!from || !to || from > to) return [];
  const [y, m, d] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const end = new Date(y2, m2 - 1, d2);
  const out = [];
  for (let t = new Date(y, m - 1, d); t <= end && out.length <= MAX_DAYS; t.setDate(t.getDate() + 1)) out.push(fmt(t));
  return out;
}

const isWorker = (e) => e.category === "Workers" || e.category === "Casuals"; // gets an OT box

export default function DayView({ employees }) {
  const { profile } = useAuth();
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [map, setMap] = useState({});
  const [otDraft, setOtDraft] = useState({}); // employeeId -> text being typed
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const dates = useMemo(() => datesBetween(from, to), [from, to]);
  const tooLong = dates.length > MAX_DAYS;
  const single = dates.length === 1;

  useEffect(() => {
    setOtDraft({});
    if (!dates.length || tooLong) { setMap({}); return undefined; }
    return listenAttendanceDetails(dates[0], dates[dates.length - 1], setMap, (e) => setError(e.message));
  }, [dates, tooLong]);

  const active = useMemo(() => employees.filter((e) => e.active), [employees]);

  const key = (emp, d) => `${emp.id}_${d}`;
  const rec = (emp, d) => map[key(emp, d)];

  // From can never be after To
  const changeFrom = (v) => { setFrom(v); if (v && to && v > to) setTo(v); };
  const changeTo = (v) => { setTo(v); if (v && from && v < from) setFrom(v); };
  const goToday = () => { setFrom(todayStr()); setTo(todayStr()); };

  const mark = async (emp, status) => {
    if (!dates.length || tooLong) return;
    setBusyId(emp.id);
    setError("");
    try { await Promise.all(dates.map((d) => setAttendance(emp.id, d, status, profile.name))); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  // Unmark: removes the posted attendance (and its OT) for these dates
  const unmark = async (emp) => {
    const posted = dates.filter((d) => rec(emp, d)?.status);
    if (!posted.length) return;
    if (posted.length > 1 && !window.confirm(`Remove ${emp.name}'s attendance for ${posted.length} days?`)) return;
    setBusyId(emp.id);
    setError("");
    try { await Promise.all(posted.map((d) => clearAttendance(emp.id, d))); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const markAll = async (status) => {
    const todo = [];
    for (const e of active) for (const d of dates) if (!rec(e, d)?.status) todo.push([e, d]);
    if (!todo.length) return;
    if (!window.confirm(`Mark ${todo.length} unmarked day(s) as ${status}?`)) return;
    setError("");
    try { await Promise.all(todo.map(([e, d]) => setAttendance(e.id, d, status, profile.name))); }
    catch (e) { setError(e.message); }
  };

  const saveOt = async (emp) => {
    const draft = otDraft[emp.id];
    if (draft === undefined) return;
    const hours = draft === "" ? 0 : Number(draft);
    if (!Number.isFinite(hours) || hours < 0) return setError("OT hours must be 0 or more.");
    const marked = dates.filter((d) => rec(emp, d)?.status);
    if (!marked.length) return setError(`Mark ${emp.name}'s status first, then enter OT.`);
    setError("");
    setOtDraft(({ [emp.id]: _gone, ...rest }) => rest);
    try { await Promise.all(marked.map((d) => setOvertime(emp.id, d, hours, profile.name))); }
    catch (e) { setError(e.message); }
  };

  // Totals are counted in employee-days (for a single date this is just employees).
  const rawSummary = [...STATUSES, HD_LEAVE, LEAVE_SANCTIONED].map((s) => [
    s, active.reduce((n, e) => n + dates.filter((d) => rec(e, d)?.status === s).length, 0),
  ]);
  // Present also gets 0.5 for every Half day and every H.d leave sanctioned day
  const cnt = (k) => rawSummary.find(([s]) => s === k)[1];
  const summary = rawSummary
    .map(([s, n]) => [s, s === "Present" ? n + 0.5 * cnt("Half day") + 0.5 * cnt(HD_LEAVE) : n])
    .filter(([s, n]) => s === HD_LEAVE ? n > 0 : s !== LEAVE_SANCTIONED); // H.d leave sanctioned card only shows when used; LS is shown inside "P + LS"
  const showLs = active.some(usesLeaveSanctioned); // Admin / Field staff: Present card reads "P + LS"
  const unmarked = active.length * dates.length -
    active.reduce((n, e) => n + dates.filter((d) => rec(e, d)?.status).length, 0);

  return (
    <>
      <div className="toolbar">
        <label className="field">From date
          <input type="date" value={from} onChange={(e) => changeFrom(e.target.value)} />
        </label>
        <label className="field">To date
          <input type="date" value={to} min={from} onChange={(e) => changeTo(e.target.value)} />
        </label>
        <button className="btn secondary" onClick={goToday}>Today</button>
        <button className="btn secondary" onClick={() => markAll("Present")}>Mark all unmarked Present</button>
      </div>
      {dates.length > 0 && !tooLong && (
        <p className="sub">
          {single ? dayLabel(dates[0]) : `${dayLabel(dates[0])} to ${dayLabel(dates[dates.length - 1])} · ${dates.length} days`}
        </p>
      )}
      {!single && dates.length > 1 && !tooLong && (
        <p className="sub">The status and OT you set apply to every day in this range. Counts below are employee-days.</p>
      )}
      {tooLong && <div className="msg error">Please pick a range of up to {MAX_DAYS} days.</div>}
      <div className="stats">
        {summary.map(([s, n]) => (
          <div key={s} className={`stat ${{ Present: "present", "Half day": "half", "HD Leave": "half", LS: "leave", Leave: "leave", Absent: "absent", Holiday: "holiday" }[s]}`}>
            <div className="label">{s === "Present" && showLs ? "P + LS" : statusLabel(s)}</div>
            <div className="value">{s === "Present" && showLs ? `${n} + ${cnt(LEAVE_SANCTIONED)} = ${n + cnt(LEAVE_SANCTIONED)}` : n}</div>
          </div>
        ))}
        <div className="stat"><div className="label">Not marked yet</div><div className="value">{unmarked}</div></div>
      </div>
      {error && <div className="msg error">{error}</div>}

      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Code</th><th>Name</th><th>Group</th><th>Status</th><th>OT (hrs)</th></tr></thead>
          <tbody>
            {active.map((e) => {
              const recs = dates.map((d) => rec(e, d)).filter((r) => r?.status);
              const statuses = new Set(recs.map((r) => r.status));
              const cur = recs.length === dates.length && statuses.size === 1 ? [...statuses][0] : undefined;
              const mixed = recs.length > 0 && !cur;
              const ots = new Set(recs.map((r) => r.ot || 0));
              const otMixed = ots.size > 1;
              const otValue = otDraft[e.id] ?? (ots.size === 1 && [...ots][0] ? String([...ots][0]) : "");
              return (
                <tr key={e.id}>
                  <td>{e.code}</td><td>{e.name}</td><td>{e.group}</td>
                  <td>
                    <div className="seg">
                      {statusesFor(e).map((s) => (
                        <button key={s} disabled={busyId === e.id}
                          className={`seg-btn ${cur === s ? "on " + s.replace(" ", "") : ""}`}
                          onClick={() => mark(e, s)}>{statusLabel(s, e)}</button>
                      ))}
                      <button disabled={busyId === e.id || recs.length === 0} className="seg-btn unmark"
                        title="Remove the posted attendance" onClick={() => unmark(e)}>Unmark</button>
                    </div>
                    {mixed && <div className="sub" style={{ margin: "4px 0 0" }}>Mixed across these dates</div>}
                  </td>
                  <td>
                    {isWorker(e) ? (
                      <input
                        type="number" min="0" step="0.5" style={{ width: 90 }}
                        value={otValue}
                        placeholder={otMixed ? "mixed" : "0"}
                        onChange={(ev) => setOtDraft({ ...otDraft, [e.id]: ev.target.value })}
                        onBlur={() => saveOt(e)}
                        onKeyDown={(ev) => { if (ev.key === "Enter") ev.target.blur(); }}
                      />
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
            {active.length === 0 && <tr><td colSpan={5} className="empty">No active employees yet. Add one under Create employee.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}