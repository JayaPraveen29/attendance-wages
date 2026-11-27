// components/StaffFilters.jsx — the Group, Unit and Category dropdowns used on the
// Attendance, Salaries and List of employees pages.
//   value    = { group, unit, category }   ("" = all)
//   onChange = (newValue) => void
import "./StaffFilters.css";

export const NO_FILTER = { group: "", unit: "", category: "" };

export const matchesFilter = (e, f) =>
  (!f.group || e.group === f.group) &&
  (!f.unit || e.unit === f.unit) &&
  (!f.category || e.category === f.category);

export const noFilterChosen = (f) => !f.group && !f.unit && !f.category;

const uniq = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export default function StaffFilters({ employees, value, onChange }) {
  const set = (key) => (ev) => onChange({ ...value, [key]: ev.target.value });
  return (
    <>
      <label className="field">Group
        <select className="staff-filter" value={value.group} onChange={set("group")}>
          <option value="">All groups</option>
          {uniq(employees.map((e) => e.group)).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>
      <label className="field">Unit
        <select className="staff-filter" value={value.unit} onChange={set("unit")}>
          <option value="">All units</option>
          {uniq(employees.map((e) => e.unit)).map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      <label className="field">Category
        <select className="staff-filter" value={value.category} onChange={set("category")}>
          <option value="">All categories</option>
          {uniq(employees.map((e) => e.category)).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    </>
  );
}
