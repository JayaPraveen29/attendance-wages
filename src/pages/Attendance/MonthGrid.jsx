// Month grid: one row per employee, one column per day (P / H / L / A).
import { useEffect, useMemo, useState } from "react";
import { listenAttendance, countsByEmployee, STATUS_SHORT } from "../../lib/attendance";
import { thisMonth, datesOfMonth, monthLabel } from "../../lib/dates";

export default function MonthGrid({ employees }) {
  const [month, setMonth] = useState(thisMonth());
  const [map, setMap] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!month) return undefined;
    const days = datesOfMonth(month);
    return listenAttendance(days[0], days[days.length - 1], setMap, (e) => setError(e.message));
  }, [month]);

  const days = month ? datesOfMonth(month) : [];
  const counts = useMemo(() => countsByEmployee(map), [map]);
  const active = employees.filter((e) => e.active);

  return (
    <>
      <div className="toolbar">
        <label className="field">Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {month && <p className="sub">{monthLabel(month)} — P present · H half day · L leave · A absent</p>}
      {error && <div className="msg error">{error}</div>}
      <div className="table-wrap">
        <table className="data grid">
          <thead>
            <tr>
              <th>Name</th>
              {days.map((d) => <th key={d} className="num">{Number(d.slice(8))}</th>)}
              <th className="num">P</th><th className="num">H</th><th className="num">L</th><th className="num">A</th>
            </tr>
          </thead>
          <tbody>
            {active.map((e) => {
              const c = counts[e.id] || { Present: 0, "Half day": 0, Leave: 0, Absent: 0 };
              return (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  {days.map((d) => {
                    const s = map[`${e.id}_${d}`];
                    return <td key={d} className={`cell ${s ? s.replace(" ", "") : ""}`}>{s ? STATUS_SHORT[s] : ""}</td>;
                  })}
                  <td className="num">{c.Present}</td><td className="num">{c["Half day"]}</td>
                  <td className="num">{c.Leave}</td><td className="num">{c.Absent}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
