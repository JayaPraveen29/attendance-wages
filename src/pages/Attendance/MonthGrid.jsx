// Month grid: one row per employee, one column per day (P / H / L / A).
// Totals: P counts a half day as 0.5 (2 H = 1 P), then L, A and OT hours (workers and casuals).
import { useEffect, useMemo, useState } from "react";
import { listenAttendanceDetails, STATUS_SHORT } from "../../lib/attendance";
import { thisMonth, datesOfMonth, monthLabel } from "../../lib/dates";

// 3 -> "3", 2.5 -> "2.5"
const num = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function MonthGrid({ employees }) {
  const [month, setMonth] = useState(thisMonth());
  const [map, setMap] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!month) return undefined;
    const days = datesOfMonth(month);
    return listenAttendanceDetails(days[0], days[days.length - 1], setMap, (e) => setError(e.message));
  }, [month]);

  const days = month ? datesOfMonth(month) : [];
  const active = employees.filter((e) => e.active);

  // per employee: { present (half day = 0.5), leave, absent, ot }
  const totals = useMemo(() => {
    const out = {};
    for (const [key, r] of Object.entries(map)) {
      const id = key.slice(0, key.lastIndexOf("_"));
      const t = (out[id] = out[id] || { present: 0, leave: 0, absent: 0, ot: 0 });
      if (r.status === "Present") t.present += 1;
      else if (r.status === "Half day") t.present += 0.5;
      else if (r.status === "Leave") t.leave += 1;
      else if (r.status === "Absent") t.absent += 1;
      if (r.status) t.ot += r.ot || 0;
    }
    return out;
  }, [map]);

  return (
    <>
      <div className="toolbar">
        <label className="field">Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {month && (
        <p className="sub">
          {monthLabel(month)} — P present · H half day · L leave · A absent. In the totals, 2 half days count as 1 P.
        </p>
      )}
      {error && <div className="msg error">{error}</div>}
      <div className="table-wrap">
        <table className="data grid">
          <thead>
            <tr>
              <th>Name</th>
              {days.map((d) => <th key={d} className="num">{Number(d.slice(8))}</th>)}
              <th className="num">P</th><th className="num">L</th><th className="num">A</th><th className="num">OT</th>
            </tr>
          </thead>
          <tbody>
            {active.map((e) => {
              const t = totals[e.id] || { present: 0, leave: 0, absent: 0, ot: 0 };
              return (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  {days.map((d) => {
                    const s = map[`${e.id}_${d}`]?.status;
                    return <td key={d} className={`cell ${s ? s.replace(" ", "") : ""}`}>{s ? STATUS_SHORT[s] : ""}</td>;
                  })}
                  <td className="num">{num(t.present)}</td>
                  <td className="num">{t.leave}</td>
                  <td className="num">{t.absent}</td>
                  <td className="num">{e.category === "Workers" || e.category === "Casuals" ? num(t.ot) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}