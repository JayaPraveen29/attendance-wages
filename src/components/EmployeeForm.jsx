import "./EmployeeForm.css";
import { useState } from "react";
import { EMPTY_EMPLOYEE, validateEmployee } from "../lib/employees";

const GROUPS = ["SIEC", "ST", "IFPL", "Giri", "Kanchan", "Murali", "Bihar", "Others"];
const GENDERS = ["Male", "Female"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function EmployeeForm({ initial, existing, exceptId, submitLabel, onSubmit, onCancel }) {
  const [f, setF] = useState({ ...EMPTY_EMPLOYEE, ...initial });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  
  const setPincode = (e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) });

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateEmployee(f, existing, exceptId);
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    try {
      await onSubmit(f);
    } catch (err) {
      setError(err.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const groupOptions = f.group && !GROUPS.includes(f.group) ? [f.group, ...GROUPS] : GROUPS;

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
        <label className="field">Date of birth<input type="date" value={f.dob} onChange={set("dob")} /></label>
        <label className="field">Date of joining<input type="date" value={f.doj} onChange={set("doj")} /></label>
        <label className="field">Designation<input value={f.designation} onChange={set("designation")} /></label>
        <label className="field">Aadhar number<input value={f.aadhar} onChange={set("aadhar")} inputMode="numeric" maxLength={14} /></label>
        <label className="field">PAN number<input value={f.pan} onChange={set("pan")} maxLength={10} style={{ textTransform: "uppercase" }} /></label>
        <label className="field">Email *<input type="email" value={f.email} onChange={set("email")} /></label>
        <label className="field">Group
          <select value={f.group} onChange={set("group")}>
            <option value="">Select group…</option>
            {groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">Gross salary (₹ / month) *<input type="number" min="0" step="0.01" value={f.grossSalary} onChange={set("grossSalary")} /></label>
        <label className="field">Phone<input value={f.phone} onChange={set("phone")} inputMode="tel" /></label>

     
        <label className="field" style={{ gridColumn: "1 / -1" }}>Address
          <textarea rows={3} value={f.address} onChange={set("address")} />
        </label>
        <label className="field">Pincode
          <input value={f.pincode} onChange={setPincode} inputMode="numeric" maxLength={6} placeholder="6-digit pincode" />
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