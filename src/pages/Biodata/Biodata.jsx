// pages/Biodata/Biodata.jsx — Unit, Category and Group dropdowns narrow the list;
// the Employee name dropdown picks the person and shows their details.
import { useEffect, useMemo, useState } from "react";
import { listenEmployees } from "../../lib/employees";
import StaffFilters, { NO_FILTER, matchesFilter, noFilterChosen } from "../../components/StaffFilters";
import "./Biodata.css";

const dash = (v) => (v === undefined || v === null || v === "" ? "—" : v);
const fmtDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("-") : dash(d));
const fmtAadhar = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 12);
  return d ? d.replace(/(\d{4})(?=\d)/g, "$1 ") : "";
};

const address = (e) => [e.co, e.houseNo, e.village, e.postOffice, e.policeStation, e.mandal, e.district, e.state, e.pincode]
  .filter(Boolean).join(", ");

// ---- blank biodata form (downloaded as a Word file, so it can be filled in by hand or typed) ----
const BLANK_SECTIONS = [
  ["Personal", ["Name", "Gender", "Blood group", "Date of birth", "Phone", "Resi. Phone", "Email"]],
  ["Employment", ["Employee ID", "Group", "Unit", "Category", "Designation", "Date of joining"]],
  ["Identity", ["Aadhar number", "PAN number"]],
  ["Address", ["C/o", "H.No", "Village/Town", "Post Office", "Police station", "Mandal/Tahsil", "District", "State", "Pin code"]],
  ["Bank", ["Bank name", "Branch name", "Account number", "IFSC"]],
];
function downloadBlankForm() {
  const rows = BLANK_SECTIONS.map(([title, labels]) => `
    <h3>${title}</h3>
    <table>${labels.map((l) => `<tr><td class="l">${l}</td><td class="v">&nbsp;</td></tr>`).join("")}</table>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Biodata form</title>
<style>
  @page { size: A4 portrait; margin: 15mm 15mm 15mm 30mm; } /* wider left margin for filing */
  body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 12pt; }
  h3 { font-size: 12pt; margin: 14pt 0 4pt; border-bottom: 1px solid #000; }
  table { width: 100%; border-collapse: collapse; }
  td { border: 1px solid #000; padding: 6pt; }
  td.l { width: 35%; font-weight: bold; }
</style></head>
<body><h1>Biodata</h1>${rows}</body></html>`;
  const url = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword" }));
  const a = document.createElement("a");
  a.href = url; a.download = "blank-biodata-form.doc";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Item({ label, value }) {
  return <div><div className="bio-label">{label}</div><div className="bio-value">{dash(value)}</div></div>;
}
function Section({ title, children }) {
  return <section><h3>{title}</h3><div className="bio-grid">{children}</div></section>;
}

export default function Biodata() {
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState(NO_FILTER); // Group / Unit / Category
  const [empId, setEmpId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => listenEmployees(setEmployees, (e) => setError(e.message)), []);

  const matching = useMemo(() => employees.filter((e) => matchesFilter(e, filters)), [employees, filters]);
  const emp = matching.find((e) => e.id === empId);

  return (
    <div className="page">
      <h1 className="no-print">List of employees</h1>
      {error && <div className="msg error no-print">{error}</div>}

      <div className="toolbar no-print sticky-bar">
        <StaffFilters employees={employees} value={filters} onChange={(v) => { setFilters(v); setEmpId(""); }} />
        <label className="field">Employee name
          <select value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ minWidth: 260 }}>
            <option value="">Select an employee…</option>
            {matching.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
          </select>
        </label>
        <button className="btn secondary" onClick={() => window.print()} disabled={!emp}>Print</button>
        {noFilterChosen(filters) && !empId && (
          <button className="btn" onClick={downloadBlankForm}>Download blank biodata form</button>
        )}
      </div>

      {!emp ? (
        // no employee picked: list everyone who matches the dropdowns (everyone when none is selected)
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Emp ID</th><th>Name</th><th>Gender</th><th>Blood group</th><th>Date of birth</th>
                <th>Phone</th><th>Resi. Phone</th><th>Email</th>
                <th>Group</th><th>Unit</th><th>Category</th><th>Designation</th><th>Date of joining</th>
                <th>Aadhar</th><th>PAN</th><th>Address</th>
                <th>Bank name</th><th>Branch</th><th>Account number</th><th>IFSC</th>
              </tr>
            </thead>
            <tbody>
              {matching.map((e) => (
                <tr key={e.id} style={{ cursor: "pointer" }} title="Click to open this employee" onClick={() => setEmpId(e.id)}>
                  <td>{e.code}</td><td>{e.name}</td><td>{dash(e.gender)}</td><td>{dash(e.bloodGroup)}</td><td>{fmtDate(e.dob)}</td>
                  <td>{dash(e.phone)}</td><td>{dash(e.residencePhone)}</td><td>{dash(e.email)}</td>
                  <td>{dash(e.group)}</td><td>{dash(e.unit)}</td><td>{dash(e.category)}</td><td>{dash(e.designation)}</td><td>{fmtDate(e.doj)}</td>
                  <td>{dash(fmtAadhar(e.aadhar))}</td><td>{dash((e.pan || "").toUpperCase())}</td><td>{dash(address(e))}</td>
                  <td>{dash(e.bankName)}</td><td>{dash(e.branchName)}</td><td>{dash(e.accountNumber)}</td><td>{dash(e.ifsc)}</td>
                </tr>
              ))}
              {matching.length === 0 && <tr><td colSpan={20} className="empty">No employees match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bio">
          <h2>{(emp.name || "").toUpperCase()}</h2>

          <Section title="Personal">
            <Item label="Gender" value={emp.gender} />
            <Item label="Blood group" value={emp.bloodGroup} />
            <Item label="Date of birth" value={fmtDate(emp.dob)} />
            <Item label="Phone" value={emp.phone} />
            <Item label="Resi. Phone" value={emp.residencePhone} />
            <Item label="Email" value={emp.email} />
          </Section>

          <Section title="Employment">
            <Item label="Employee ID" value={emp.code} />
            <Item label="Group" value={emp.group} />
            <Item label="Unit" value={emp.unit} />
            <Item label="Category" value={emp.category} />
            <Item label="Designation" value={emp.designation} />
            <Item label="Date of joining" value={fmtDate(emp.doj)} />
          </Section>

          <Section title="Identity">
            <Item label="Aadhar number" value={fmtAadhar(emp.aadhar)} />
            <Item label="PAN number" value={(emp.pan || "").toUpperCase()} />
          </Section>

          <Section title="Address">
            <Item label="C/o" value={emp.co} />
            <Item label="H.No" value={emp.houseNo} />
            <Item label="Village/Town" value={emp.village} />
            <Item label="Post Office" value={emp.postOffice} />
            <Item label="Police station" value={emp.policeStation} />
            <Item label="Mandal/Tahsil" value={emp.mandal} />
            <Item label="District" value={emp.district} />
            <Item label="State" value={emp.state} />
            <Item label="Pin code" value={emp.pincode} />
          </Section>

          <Section title="Bank">
            <Item label="Bank name" value={emp.bankName} />
            <Item label="Branch name" value={emp.branchName} />
            <Item label="Account number" value={emp.accountNumber} />
            <Item label="IFSC" value={emp.ifsc} />
          </Section>
        </div>
      )}
    </div>
  );
}
