// lib/permissions.js
//
// Single place for "who can do what". Change a rule here and it applies
// everywhere (routing, nav, buttons).
//
//   Admin    (shown as "Web Dev / Admin") and Director -> full access + approvals
//   Employee -> own attendance / own employee record, can mark self Present
//               today, and (per the spec) can open Salaries.

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

// Create / edit / deactivate / delete employees
export const canManageEmployees = isApprover;

// Mark attendance for anyone on any date
export const canMarkAnyAttendance = isApprover;

// Approvals page (approve, reject, change roles, delete accounts)
export const canApprove = isApprover;

// Salaries: view/edit, print, export, finalize, edit a finalized month.
// Spec says every approved role can do this. To restrict it, change this.
const SALARY_ROLES = ["Admin", "Director", "Employee"];
export const canUseSalaries = (profile) =>
  !!profile && profile.status === "approved" && SALARY_ROLES.includes(profile.role);

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
