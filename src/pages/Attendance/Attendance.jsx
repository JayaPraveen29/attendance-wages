// pages/Attendance/Attendance.jsx
//   Admin / Director / Employee -> mark anyone, any date (Day view), By employee, Month grid
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenEmployees } from "../../lib/employees";
import { canMarkAnyAttendance } from "../../lib/permissions";
import DayView from "./DayView";
import MonthGrid from "./MonthGrid";
import EmployeeView from "./EmployeeView";
import "./Attendance.css";

export default function Attendance() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [view, setView] = useState("day");
  const [error, setError] = useState("");

  useEffect(() => listenEmployees(setEmployees, (e) => setError(e.message)), []);

  const admin = canMarkAnyAttendance(profile);

  return (
    <div className="page">
      <h1>Attendance</h1>
      <p className="sub">Present, Half day, Leave or Absent.</p>
      {error && <div className="msg error">{error}</div>}

      {admin && (
        <>
          <div className="tabs">
            <button className={`tab ${view === "day" ? "active" : ""}`} onClick={() => setView("day")}>Day</button>
            <button className={`tab ${view === "employee" ? "active" : ""}`} onClick={() => setView("employee")}>By employee</button>
            <button className={`tab ${view === "month" ? "active" : ""}`} onClick={() => setView("month")}>Month</button>
          </div>
          {view === "day" && <DayView employees={employees} />}
          {view === "employee" && <EmployeeView employees={employees} />}
          {view === "month" && <MonthGrid employees={employees} />}
        </>
      )}
    </div>
  );
}