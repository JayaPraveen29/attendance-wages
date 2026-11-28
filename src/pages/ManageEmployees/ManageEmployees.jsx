// pages/ManageEmployees/ManageEmployees.jsx — view full details, edit, deactivate/activate, delete
import { useEffect, useMemo, useState } from "react";
import { listenEmployees, updateEmployee, setEmployeeActive, deleteEmployee } from "../../lib/employees";
import EmployeeForm from "../../components/EmployeeForm";

const UNITS = ["Unit 1", "Unit 2"];
const CATEGORIES = ["Directors", "Admin Staff", "Field Staff", "Workers", "Casuals"];
const isWorker = (e) => e.category === "Workers";
// "123456789012" -> "1234 5678 9012"
const fmtAadhar = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 12);
  return d ? d.replace(/(\d{4})(?=\d)/g, "$1 ") : "";
};
const inr = (n) => Number(n || 0).toLocaleString("en-IN");
const dash = (v) => (v === undefined || v === null || v === "" ? "—" : v);
// "2000-03-25" -> "25-03-2000"
const fmtDate = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("-") : dash(d));

const detailGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "14px 20px" };
const detailLabel = { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 2 };
const detailValue = { fontSize: 15, fontWeight: 600, wordBreak: "break-word" };

function Detail({ label, value }) {
  return (
    <div>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{dash(value)}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 15, color: "var(--navy)", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>{title}</h3>
      <div style={detailGrid}>{children}</div>
    </section>
  );
}

export default function ManageEmployees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState("all"); // all | active | inactive
  const [groupFilter, setGroupFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState({ type: "", text: "" });
  const [selectedIds, setSelectedIds] = useState([]); // ticked rows

  useEffect(
    () => listenEmployees(setEmployees, (e) => setNotice({ type: "error", text: e.message })),
    []
  );

  const groups = useMemo(() => [...new Set(employees.map((e) => e.group).filter(Boolean))].sort(), [employees]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .slice()
      // sort by Employee ID in natural order: 1, 2, 3 ... 10 (not 1, 10, 2)
      .sort((a, b) => String(a.code || "").localeCompare(String(b.code || ""), undefined, { numeric: true, sensitivity: "base" }))
      .filter((e) => {
      if (show === "active" && !e.active) return false;
      if (show === "inactive" && e.active) return false;
      if (groupFilter !== "all" && e.group !== groupFilter) return false;
      if (unitFilter !== "all" && e.unit !== unitFilter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      return (
        !q ||
        [e.name, e.code, e.email, e.group, e.unit, e.category, e.designation, e.phone].some((v) => (v || "").toLowerCase().includes(q))
      );
    });
  }, [employees, search, show, groupFilter, unitFilter, categoryFilter]);

  const run = async (fn, okText) => {
    try { await fn(); setNotice({ type: "ok", text: okText }); }
    catch (e) { setNotice({ type: "error", text: e.message }); }
  };

  // ---- tick boxes + the action bar above the table ----
  const selected = rows.filter((e) => selectedIds.includes(e.id)); // only rows that are still visible
  const one = selected.length === 1 ? selected[0] : null;
  const allTicked = rows.length > 0 && selected.length === rows.length;
  const toggle = (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const toggleAll = () => setSelectedIds(allTicked ? [] : rows.map((e) => e.id));
  const anyActive = selected.some((e) => e.active);

  const toggleActive = () => {
    const targets = anyActive ? selected.filter((e) => e.active) : selected;
    const makeActive = !anyActive;
    run(
      () => Promise.all(targets.map((e) => setEmployeeActive(e.id, makeActive))),
      targets.length === 1
        ? `${targets[0].name} is now ${makeActive ? "active" : "inactive"}.`
        : `${targets.length} employees are now ${makeActive ? "active" : "inactive"}.`
    );
  };

  const removeSelected = () => {
    if (!selected.length) return;
    const what = selected.length === 1 ? selected[0].name : `${selected.length} employees`;
    if (!window.confirm(`Delete ${what}? This also removes their attendance and payroll entries and cannot be undone.\n\nTip: use Deactivate to keep history.`)) return;
    setViewing(null);
    const ids = selected.map((e) => e.id);
    run(() => Promise.all(ids.map((id) => deleteEmployee(id))), `${what} ${selected.length === 1 ? "was" : "were"} deleted.`)
      .then(() => setSelectedIds((cur) => cur.filter((id) => !ids.includes(id))));
  };

  // keep the open detail dialog in sync with live data
  const viewed = viewing ? employees.find((e) => e.id === viewing.id) || viewing : null;

  return (
    <div className="page">
      <h1>Manage employees</h1>
      <p className="sub">{employees.length} employees.</p>
      {notice.text && <div className={`msg ${notice.type}`}>{notice.text}</div>}

      <div className="toolbar">
        <label className="field">Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name, ID, email, phone, designation" style={{ minWidth: 260 }} />
        </label>
        <label className="field">Group
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="field">Unit
          <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="all">All units</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="field">Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Show
          <select value={show} onChange={(e) => setShow(e.target.value)}>
            <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {/* actions for the ticked rows; blanked out until a row is ticked */}
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <button className="btn small" disabled={!one} onClick={() => setViewing(one)}>View</button>
        <button className="btn small secondary" disabled={!one} onClick={() => setEditing(one)}>Edit</button>
        <button className="btn small secondary" disabled={!selected.length} onClick={toggleActive}>
          {selected.length && !anyActive ? "Activate" : "Deactivate"}
        </button>
        <button className="btn small danger" disabled={!selected.length} onClick={removeSelected}>Delete</button>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
          {selected.length ? `${selected.length} selected` : "Tick a row to use these options"}
        </span>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 36 }}><input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Select all" /></th>
              <th>Employee ID</th><th>Name</th><th>Group</th><th>Unit</th><th>Category</th><th>Designation</th><th>Phone</th><th>Email</th>
              <th className="num">Salary ₹</th><th className="num">Paysheet ₹</th><th className="num">PT ₹</th><th>EPF</th><th>ESI</th><th>OT</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} style={selectedIds.includes(e.id) ? { background: "#eef5f1" } : undefined}>
                <td><input type="checkbox" checked={selectedIds.includes(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${e.name}`} /></td>
                <td>{e.code}</td>
                <td><strong>{e.name}</strong></td>
                <td>{dash(e.group)}</td>
                <td>{dash(e.unit)}</td>
                <td>{dash(e.category)}</td>
                <td>{dash(e.designation)}</td>
                <td>{dash(e.phone)}</td>
                <td>{e.email}</td>
                <td className="num">{inr(isWorker(e) ? e.actualSalary ?? e.grossSalary : e.grossSalary)}</td>
                <td className="num">{isWorker(e) ? inr(e.statutorySalary) : "—"}</td>
                <td className="num">{isWorker(e) ? inr(e.professionalTax) : "—"}</td>
                <td>{e.epf ? "Yes" : "No"}</td><td>{e.esi ? "Yes" : "No"}</td>
                <td>{isWorker(e) ? (e.otApplicable === false ? "No" : "Yes") : "—"}</td>
                <td><span className={`badge ${e.active ? "green" : "grey"}`}>{e.active ? "Active" : "Inactive"}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={16} className="empty">No employees match. Try a different search or filter.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ---------- full details ---------- */}
      {viewed && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>{viewed.name}</h2>
                <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                  {viewed.code} · <span className={`badge ${viewed.active ? "green" : "grey"}`}>{viewed.active ? "Active" : "Inactive"}</span>
                </div>
              </div>
              <button className="btn small secondary" onClick={() => setViewing(null)}>Close</button>
            </div>

            <Section title="Personal">
              <Detail label="Gender" value={viewed.gender} />
              <Detail label="Blood group" value={viewed.bloodGroup} />
              <Detail label="Date of birth" value={fmtDate(viewed.dob)} />
              <Detail label="Phone" value={viewed.phone} />
              <Detail label="Email" value={viewed.email} />
            </Section>

            <Section title="Employment">
              <Detail label="Employee ID" value={viewed.code} />
              <Detail label="Group" value={viewed.group} />
              <Detail label="Unit" value={viewed.unit} />
              <Detail label="Category" value={viewed.category} />
              <Detail label="Designation" value={viewed.designation} />
              <Detail label="Date of joining" value={fmtDate(viewed.doj)} />
              {isWorker(viewed) ? (
                <>
                  <Detail label="Salary (₹ / month)" value={inr(viewed.actualSalary ?? viewed.grossSalary)} />
                  <Detail label="Paysheet (₹ / month)" value={inr(viewed.statutorySalary)} />
                  <Detail label="Professional tax (₹ / month)" value={inr(viewed.professionalTax)} />
                  <Detail label="OT applicable" value={viewed.otApplicable === false ? "No" : "Yes"} />
                </>
              ) : (
                <Detail label="Salary (₹ / month)" value={inr(viewed.grossSalary)} />
              )}
              <Detail label="EPF applicable" value={viewed.epf ? "Yes" : "No"} />
              <Detail label="ESI applicable" value={viewed.esi ? "Yes" : "No"} />
            </Section>

            <Section title="Identity">
              <Detail label="Aadhar number" value={fmtAadhar(viewed.aadhar)} />
              <Detail label="PAN number" value={(viewed.pan || "").toUpperCase()} />
            </Section>

            <Section title="Address">
              <Detail label="C/o" value={viewed.co} />
              <Detail label="H.No" value={viewed.houseNo} />
              <Detail label="Village/Town" value={viewed.village} />
              <Detail label="Post Office" value={viewed.postOffice} />
              <Detail label="Police station" value={viewed.policeStation} />
              <Detail label="Mandal/Tahsil" value={viewed.mandal} />
              <Detail label="District" value={viewed.district} />
              <Detail label="State" value={viewed.state} />
              <Detail label="Pin code" value={viewed.pincode} />
            </Section>

            <Section title="Bank">
              <Detail label="Bank name" value={viewed.bankName} />
              <Detail label="Branch name" value={viewed.branchName} />
              <Detail label="Account number" value={viewed.accountNumber} />
              <Detail label="IFSC" value={viewed.ifsc} />
            </Section>

            <div className="toolbar" style={{ marginBottom: 0 }}>
              <button className="btn" onClick={() => { setEditing(viewed); setViewing(null); }}>Edit</button>
              <button className="btn secondary" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- edit ---------- */}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Edit {editing.name}</h2>
            <EmployeeForm
              initial={editing}
              existing={employees}
              exceptId={editing.id}
              submitLabel="Save changes"
              onCancel={() => setEditing(null)}
              onSubmit={async (form) => {
                await updateEmployee(editing.id, form);
                setNotice({ type: "ok", text: `${form.name.trim()} was updated.` });
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}