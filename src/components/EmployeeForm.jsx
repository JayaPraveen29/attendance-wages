import "./EmployeeForm.css";
// components/EmployeeForm.jsx
// Shared by Create Employee and the Edit dialog in Manage Employees.
import { useState } from "react";
import { EMPTY_EMPLOYEE, validateEmployee } from "../lib/employees";

const GROUPS = ["SIEC", "ST", "IFPL", "Giri", "Kanchan", "Murali", "Bihar", "Others"];
const GENDERS = ["Male", "Female"];
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

const ADD_NEW = "__add_new_group__";

export default function EmployeeForm({ initial, existing = [], exceptId, submitLabel, onSubmit, onCancel }) {
  const [f, setF] = useState({ ...EMPTY_EMPLOYEE, ...initial });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState("");

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  // Pincode: digits only, max 6
  const setPincode = (e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) });

  const submit = async (e) => {
    e.preventDefault();
    let data = f;
    if (addingGroup) {
      const name = newGroup.trim().replace(/\s+/g, " ");
      if (!name) return setError("Enter the new group name, or pick an existing group.");
      // If it matches an existing group (ignoring case), reuse that spelling.
      const match = groupOptions.find((g) => g.toLowerCase() === name.toLowerCase());
      data = { ...f, group: match || name };
    }
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
  )].sort((a, b) => a.localeCompare(b));
  const groupOptions = [...GROUPS, ...customGroups];

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
        <label className="field">Designation<input value={f.designation} onChange={set("designation")} /></label>
        <label className="field">Aadhar number<input value={f.aadhar} onChange={set("aadhar")} inputMode="numeric" maxLength={14} /></label>
        <label className="field">PAN number<input value={f.pan} onChange={set("pan")} maxLength={10} style={{ textTransform: "uppercase" }} /></label>
        <label className="field">Email (optional)<input type="email" value={f.email} onChange={set("email")} /></label>
        <label className="field">Group
          <select value={addingGroup ? ADD_NEW : f.group} onChange={onGroupChange}>
            <option value="">Select group…</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value={ADD_NEW}>+ Add new group…</option>
          </select>
        </label>
        {addingGroup && (
          <label className="field">New group name
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)}  autoFocus maxLength={40} />
          </label>
        )}
        <label className="field">Gross salary (₹ / month) *<input type="number" min="0" step="0.01" value={f.grossSalary} onChange={set("grossSalary")} /></label>
        <label className="field">Phone<input value={f.phone} onChange={set("phone")} inputMode="tel" /></label>

        {/* Address, split into parts */}
        <label className="field">C/o<input value={f.co} onChange={set("co")}  /></label>
        <label className="field">H.No<input value={f.houseNo} onChange={set("houseNo")} /></label>
        <label className="field">Village<input value={f.village} onChange={set("village")} /></label>
        <label className="field">Mandal<input value={f.mandal} onChange={set("mandal")} /></label>
        <label className="field">District<input value={f.district} onChange={set("district")} /></label>
        <label className="field">State<input value={f.state} onChange={set("state")} /></label>
        <label className="field">Pin code
          <input value={f.pincode} onChange={setPincode} inputMode="numeric" maxLength={6} placeholder="6-digit pin code" />
        </label>

        <label className="field">Bank name<input value={f.bankName} onChange={set("bankName")} /></label>
        <label className="field">Account number<input value={f.accountNumber} onChange={set("accountNumber")} inputMode="numeric" /></label>
        <label className="field">IFSC<input value={f.ifsc} onChange={set("ifsc")} /></label>
      </div>

      <div className="form-checks">
        <label><input type="checkbox" checked={f.epf} onChange={set("epf")} /> EPF applicable</label>
        <label><input type="checkbox" checked={f.esi} onChange={set("esi")} /> ESI applicable</label>
      </div>

      <div className="toolbar">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}