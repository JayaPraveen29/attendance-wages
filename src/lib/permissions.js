// lib/permissions.js
//
// Single place for "who can do what". Change a rule here and it applies
// everywhere (routing, nav, buttons).
//
//   Admin    (shown as "Web Dev / Admin") and Director -> everything, including Approvals
//   Employee -> full data entry (create / manage employees, attendance for anyone)
//               and reports (Salaries: view, print, export, finalize).
//               Employees can NOT open the Approvals page.

export const ROLES = ["Admin", "Director", "Employee"];
export const ROLE_LABELS = {
  Admin: "Web Dev / Admin",
  Director: "Director",
  Employee: "Employee",
};
export const roleLabel = (r) => ROLE_LABELS[r] || r || "";

export const APPROVER_ROLES = ["Admin", "Director"];

export const isApprover = (profile) =>
  !!profile && profile.status === "approved" && APPROVER_ROLES.includes(profile.role);

// Any approved user (Admin, Director or Employee)
const DATA_ENTRY_ROLES = ["Admin", "Director", "Employee"];
export const hasDataEntryAccess = (profile) =>
  !!profile && profile.status === "approved" && DATA_ENTRY_ROLES.includes(profile.role);

// Create / edit / deactivate / delete employees  -> all approved roles
export const canManageEmployees = hasDataEntryAccess;

// Mark attendance for anyone on any date  -> all approved roles
export const canMarkAnyAttendance = hasDataEntryAccess;

// Salaries / reports: view/edit, print, export, finalize  -> all approved roles
export const canUseSalaries = hasDataEntryAccess;

// Approvals page (approve, reject, change roles, delete accounts)
// -> ONLY Director and Admin / Web Dev
export const canApprove = isApprover;

// Landing page after login
export const homePath = () => "/attendance";

// Role-change / delete guards used by the Approvals page.
// `users` = every user doc ({uid, role, status}).
export function approverCount(users) {
  return users.filter((u) => u.status === "approved" && APPROVER_ROLES.includes(u.role)).length;
}

// Returns "" if allowed, otherwise the reason it is not.
export function roleChangeBlockReason(me, target, newRole, users) {
  if (me.uid === target.uid && APPROVER_ROLES.includes(target.role) && !APPROVER_ROLES.includes(newRole)) {
    if (approverCount(users) <= 1) {
      return "You are the only Director/Admin, so you cannot demote yourself.";
    }
  }
  return "";
}

export function deleteBlockReason(me, target) {
  if (me.uid === target.uid) return "You cannot delete your own account.";
  return "";
}
