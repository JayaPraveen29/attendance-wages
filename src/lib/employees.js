// lib/employees.js
//
//   employees/{id} {
//     name, code, email, group, unit, category, grossSalary,
//     actualSalary, statutorySalary, professionalTax, otApplicable (Workers),
//     monthlySalary / daySalary (Casuals: only one of the two is filled),
//     gender, bloodGroup, dob, doj, designation, aadhar, pan,
//     address, pincode,
//     epf (bool), esi (bool),                 // is EPF / ESI deducted for this person
//     bankName, accountNumber, ifsc, phone,
//     active (bool), createdAt
//   }
// Email is just optional contact info. It is NOT linked to any login.

import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy,
  where, getDocs, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

const COL = "employees";

export const EMPTY_EMPLOYEE = {
  name: "", code: "", email: "", group: "", grossSalary: "",
  unit: "", category: "",
  actualSalary: "", statutorySalary: "", professionalTax: 0, otApplicable: true,
  monthlySalary: "", daySalary: "",
  gender: "", bloodGroup: "", dob: "", doj: "", designation: "",
  aadhar: "", pan: "",
  address: "", co: "", houseNo: "", village: "", mandal: "", district: "", state: "", pincode: "",
  epf: true, esi: false,
  bankName: "", branchName: "", accountNumber: "", ifsc: "", phone: "", residencePhone: "",
};

const s = (v) => (v == null ? "" : String(v)).trim();

function clean(f) {
  return {
    name: s(f.name),
    code: s(f.code).toUpperCase(),
    email: s(f.email).toLowerCase(),
    group: s(f.group),
    unit: s(f.unit),
    category: s(f.category),
    grossSalary: Number(f.grossSalary) || 0,
    actualSalary: Number(f.actualSalary) || 0,
    statutorySalary: Number(f.statutorySalary) || 0,
    professionalTax: Number(f.professionalTax) || 0,
    monthlySalary: Number(f.monthlySalary) || 0,
    daySalary: Number(f.daySalary) || 0,
    otApplicable: f.otApplicable !== false,
    gender: s(f.gender),
    bloodGroup: s(f.bloodGroup),
    dob: s(f.dob),
    doj: s(f.doj),
    designation: s(f.designation),
    aadhar: s(f.aadhar),
    pan: s(f.pan).toUpperCase(),
    address: s(f.address),
    co: s(f.co),
    houseNo: s(f.houseNo),
    village: s(f.village),
    mandal: s(f.mandal),
    district: s(f.district),
    state: s(f.state),
    pincode: s(f.pincode),
    epf: !!f.epf,
    esi: !!f.esi,
    bankName: s(f.bankName),
    branchName: s(f.branchName),
    accountNumber: s(f.accountNumber),
    ifsc: s(f.ifsc).toUpperCase(),
    phone: s(f.phone),
    residencePhone: s(f.residencePhone),
  };
}

// Returns an error message, or "" if the form is valid.
export function validateEmployee(f, list, exceptId = null) {
  if (!s(f.name)) return "Name is required.";
  if (!s(f.code)) return "Employee code is required.";
  if (s(f.email) && !/^\S+@\S+\.\S+$/.test(s(f.email))) return "Email looks wrong.";
  if (!(Number(f.grossSalary) > 0)) return "Salary must be greater than 0.";
  if (s(f.phone) && !/^\+?[0-9 -]{7,15}$/.test(s(f.phone))) return "Phone number looks wrong.";
  if (s(f.residencePhone) && !/^\+?[0-9 -]{7,15}$/.test(s(f.residencePhone))) return "Residency phone number looks wrong.";
  if (s(f.pincode) && !/^[1-9][0-9]{5}$/.test(s(f.pincode))) return "Pincode must be a valid 6-digit number.";
  const code = s(f.code).toUpperCase();
  if (list.some((e) => e.id !== exceptId && (e.code || "").toUpperCase() === code)) {
    return `Employee code ${code} is already used.`;
  }
  return "";
}

export function addEmployee(form) {
  return addDoc(collection(db, COL), { ...clean(form), active: true, createdAt: serverTimestamp() });
}

export function updateEmployee(id, form) {
  return updateDoc(doc(db, COL, id), clean(form));
}

export function setEmployeeActive(id, active) {
  return updateDoc(doc(db, COL, id), { active });
}

// Deletes the employee and every attendance / payroll row that points to them.
export async function deleteEmployee(id) {
  const batch = writeBatch(db);
  for (const col of ["attendance", "payrollEntries"]) {
    const snap = await getDocs(query(collection(db, col), where("employeeId", "==", id)));
    snap.forEach((d) => batch.delete(d.ref));
  }
  batch.delete(doc(db, COL, id));
  await batch.commit();
}

export function listenEmployees(callback, onError) {
  const q = query(collection(db, COL), orderBy("name", "asc"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}