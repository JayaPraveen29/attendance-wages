import "./EmployeeForm.css";
// components/EmployeeForm.jsx
// Shared by Create Employee and the Edit dialog in Manage Employees.
import { useState } from "react";
import { EMPTY_EMPLOYEE, validateEmployee } from "../lib/employees";

const GROUPS = ["SIEC", "ST", "IFPL", "Giri", "Kanchan", "Murali", "Bihar", "Others"];
const GENDERS = ["Male", "Female"];
const UNITS = ["Unit 1", "Unit 2"];
const CATEGORIES = ["Directors", "Admin Staff", "Field Staff", "Workers", "Casuals"];
// Categories that have two salaries (Salary and Paysheet salary) instead of one gross salary.
// Change this list if the category is called something else.
const SALARY_TYPE_CATEGORIES = ["Workers"];

// Professional tax slab (per month), applied to paysheet salary only:
//   below 15,000 -> 0 | 15,000 to 20,000 -> 150 | above 20,000 -> 200
export function professionalTax(salary) {
  const n = Number(salary) || 0;
  if (n < 15000) return 0;
  if (n <= 20000) return 150;
  return 200;
}

// Groups the user chose to remove from the dropdown (kept in this browser).
const HIDDEN_KEY = "hiddenGroups";
const loadHidden = () => {
  try { return JSON.parse(localStorage.getItem(HIDDEN_KEY)) || []; } catch { return []; }
};
const saveHidden = (list) => {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// Age in whole years from a "YYYY-MM-DD" date of birth. Returns "" if DOB is empty/invalid.
function ageFromDob(dob) {
  if (!dob) return "";
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return "";
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age >= 0 ? age : "";
}

const todayStr = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

const DEFAULT_EMAIL = "@gmail.com";
const ADD_NEW = "__add_new_group__";

export default function EmployeeForm({ initial, existing = [], exceptId, submitLabel, onSubmit, onCancel }) {
  const [f, setF] = useState({ unit: "", category: "", branchName: "", postOffice: "", policeStation: "", actualSalary: "", statutorySalary: "", professionalTax: 0, otApplicable: true, ...EMPTY_EMPLOYEE, ...(initial ? {} : { email: DEFAULT_EMAIL }), ...initial });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [hiddenGroups, setHiddenGroups] = useState(loadHidden);

  const needsSalaryType = SALARY_TYPE_CATEGORIES.includes(f.category);
  const isWorker = f.category === "Workers";
  const pt = needsSalaryType ? professionalTax(f.statutorySalary) : 0;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  // Aadhar: digits only, max 12, shown as "1234 5678 9012" (space after every 4 digits)
  const fmtAadhar = (v) => String(v || "").replace(/\D/g, "").slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 ");
  const setAadhar = (e) => setF({ ...f, aadhar: fmtAadhar(e.target.value) });

  // PAN: letters and digits only, always capital letters, max 10
  const setPan = (e) => setF({ ...f, pan: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10) });

  // Pincode: digits only, max 6
  const setPincode = (e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) });

  const submit = async (e) => {
    e.preventDefault();
    let data = f;
    // an untouched "@gmail.com" means no email was entered
    if ((data.email || "").trim().toLowerCase() === DEFAULT_EMAIL) data = { ...data, email: "" };
    if (addingGroup) {
      const name = newGroup.trim().replace(/\s+/g, " ");
      if (!name) return setError("Enter the new group name, or pick an existing group.");
      // If it matches an existing group (ignoring case), reuse that spelling.
      const match = groupOptions.find((g) => g.toLowerCase() === name.toLowerCase());
      data = { ...f, group: match || name };
    }
    if (!data.unit) return setError("Select a unit (Unit 1 or Unit 2).");
    if (!data.category) return setError("Select a category (Directors, Admin Staff, Field Staff, Workers or Casuals).");
    if (SALARY_TYPE_CATEGORIES.includes(data.category)) {
      if (!(Number(data.actualSalary) > 0)) return setError("Enter the salary.");
      if (!(Number(data.statutorySalary) > 0)) return setError("Enter the paysheet amount.");
      data = {
        ...data,
        actualSalary: Number(data.actualSalary),
        statutorySalary: Number(data.statutorySalary),
        grossSalary: Number(data.actualSalary), // keeps existing payroll screens working
        professionalTax: professionalTax(data.statutorySalary),
      };
    } else {
      data = { ...data, actualSalary: "", statutorySalary: "", professionalTax: 0 };
    }
    data = { ...data, otApplicable: data.category === "Workers" ? data.otApplicable !== false : false };
    const problem = validateEmployee(data, existing, exceptId);
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    try {
      await onSubmit(data);
    } catch (err) {
      setError(err.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  // If an older record has a group that is not in the list, keep it selectable
  // so editing that employee does not silently blank it.
  // Groups created earlier by anyone (found on existing employees) are listed after "Others".
  const customGroups = [...new Set(
    [...existing.map((x) => x.group), f.group]
      .map((g) => (g || "").trim())
      .filter((g) => g && !GROUPS.some((d) => d.toLowerCase() === g.toLowerCase()))
      // hidden (deleted) groups stay visible only if this employee currently has it
      .filter((g) => !hiddenGroups.includes(g) || g === (initial?.group || "").trim())
  )].sort((a, b) => a.localeCompare(b));
  const groupOptions = [...GROUPS, ...customGroups];

  const isCustomSelected = !addingGroup && f.group &&
    !GROUPS.some((d) => d.toLowerCase() === f.group.toLowerCase());

  const deleteSelectedGroup = () => {
    if (!isCustomSelected) return;
    if (!window.confirm(`Remove the group "${f.group}" from the dropdown?\nEmployees already in this group keep it.`)) return;
    const next = [...new Set([...hiddenGroups, f.group])];
    setHiddenGroups(next);
    saveHidden(next);
    setF({ ...f, group: "" });
  };

  const onGroupChange = (e) => {
    if (e.target.value === ADD_NEW) {
      setAddingGroup(true);
      setF({ ...f, group: "" });
    } else {
      setAddingGroup(false);
      setNewGroup("");
      setF({ ...f, group: e.target.value });
    }
  };

  return (
    <form onSubmit={submit} className="emp-form">
      {error && <div className="msg error">{error}</div>}

      <div className="form-grid">
        <label className="field">Employee ID *<input value={f.code} onChange={set("code")} /></label>
        <label className="field">Name *<input value={f.name} onChange={set("name")} /></label>
        <label className="field">Gender
          <select value={f.gender} onChange={set("gender")}>
            <option value="">Select…</option>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">Blood group
          <select value={f.bloodGroup} onChange={set("bloodGroup")}>
            <option value="">Select…</option>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="field">Date of birth<input type="date" max={todayStr()} value={f.dob} onChange={set("dob")} /></label>
        <label className="field">Age
          <input value={ageFromDob(f.dob) === "" ? "" : `${ageFromDob(f.dob)} years`} readOnly tabIndex={-1}  />
        </label>
        <label className="field">Date of joining<input type="date" value={f.doj} onChange={set("doj")} /></label>
        <label className="field">Aadhar number<input value={fmtAadhar(f.aadhar)} onChange={setAadhar} inputMode="numeric" maxLength={14} /></label>
        <label className="field">PAN number<input value={(f.pan || "").toUpperCase()} onChange={setPan} maxLength={10} style={{ textTransform: "uppercase" }} /></label>
        <label className="field">Email
          <input
            type="text"
            inputMode="email"
            value={f.email}
            onChange={set("email")}
            onFocus={(e) => { if (e.target.value === DEFAULT_EMAIL) e.target.setSelectionRange(0, 0); }}
          />
        </label>
        <label className="field">Group
          <select value={addingGroup ? ADD_NEW : f.group} onChange={onGroupChange}>
            <option value="">Select group…</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value={ADD_NEW}>+ Add new group…</option>
          </select>
        </label>
        {isCustomSelected && (
          <div className="field">
            <span>&nbsp;</span>
            <button type="button" className="btn secondary" onClick={deleteSelectedGroup}>
              Delete group “{f.group}”
            </button>
          </div>
        )}
        {addingGroup && (
          <label className="field">New group name
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)}  autoFocus maxLength={40} />
          </label>
        )}
        <label className="field">Unit *
          <select value={f.unit} onChange={set("unit")}>
            <option value="">Select unit…</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="field">Category *
          <select
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value, })}
          >
            <option value="">Select category…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Designation<input value={f.designation} onChange={set("designation")} /></label>
        {!needsSalaryType && (
          <label className="field">Salary (₹ / month) *<input type="number" min="0" step="0.01" value={f.grossSalary} onChange={set("grossSalary")} /></label>
        )}
        {needsSalaryType && (
          <>
            <label className="field">Salary (₹ / month) *
              <input type="number" min="0" step="0.01" value={f.actualSalary} onChange={set("actualSalary")} />
            </label>
            <label className="field">Paysheet (₹ / month) *
              <input type="number" min="0" step="0.01" value={f.statutorySalary} onChange={set("statutorySalary")} />
            </label>
            <label className="field">Professional tax (₹ / month)
              <input value={pt} readOnly tabIndex={-1} />
            </label>
          </>
        )}
        <label className="field">Phone<input value={f.phone} onChange={set("phone")} inputMode="tel" /></label>

        {/* Address, split into parts */}
        <label className="field">C/o<input value={f.co} onChange={set("co")}  /></label>
        <label className="field">H.No<input value={f.houseNo} onChange={set("houseNo")} /></label>
        <label className="field">Village/Town<input value={f.village} onChange={set("village")} /></label>
        <label className="field">Post Office<input value={f.postOffice} onChange={set("postOffice")} /></label>
        <label className="field">Police station<input value={f.policeStation} onChange={set("policeStation")} /></label>
        <label className="field">Mandal/Tahsil<input value={f.mandal} onChange={set("mandal")} /></label>
        <label className="field">District<input value={f.district} onChange={set("district")} /></label>
        <label className="field">State<input value={f.state} onChange={set("state")} /></label>
        <label className="field">Pin code
          <input value={f.pincode} onChange={setPincode} inputMode="numeric" maxLength={6} placeholder="6-digit pin code" />
        </label>

        <label className="field">Bank name<input value={f.bankName} onChange={set("bankName")} /></label>
        <label className="field">Branch name<input value={f.branchName} onChange={set("branchName")} /></label>
        <label className="field">Account number<input value={f.accountNumber} onChange={set("accountNumber")} inputMode="numeric" /></label>
        <label className="field">IFSC<input value={f.ifsc} onChange={set("ifsc")} /></label>
      </div>

      <div className="form-checks">
        <label><input type="checkbox" checked={f.epf} onChange={set("epf")} /> EPF applicable</label>
        <label><input type="checkbox" checked={f.esi} onChange={set("esi")} /> ESI applicable</label>
        {isWorker && (
          <label><input type="checkbox" checked={f.otApplicable !== false} onChange={set("otApplicable")} /> OT applicable</label>
        )}
      </div>

      <div className="toolbar">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}