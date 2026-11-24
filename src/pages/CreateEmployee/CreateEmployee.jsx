// pages/CreateEmployee/CreateEmployee.jsx — add a new employee
import { useEffect, useState } from "react";
import { listenEmployees, addEmployee } from "../../lib/employees";
import EmployeeForm from "../../components/EmployeeForm";

export default function CreateEmployee() {
  const [employees, setEmployees] = useState([]);
  const [notice, setNotice] = useState("");
  const [formKey, setFormKey] = useState(0); // bump to clear the form after saving

  useEffect(() => listenEmployees(setEmployees), []);

  const save = async (form) => {
    await addEmployee(form);
    setNotice(`${form.name.trim()} was added.`);
    setFormKey((k) => k + 1);
  };

  return (
    <div className="page">
      <h1>Create employee</h1>
      <p className="sub">Enter the employee details. Email is optional and is not linked to any login.</p>
      {notice && <div className="msg ok">{notice}</div>}
      <div className="card">
        <EmployeeForm key={formKey} existing={employees} submitLabel="Add employee" onSubmit={save} />
      </div>
    </div>
  );
}
