# HR & Payroll

React + Vite + Firebase (Auth + Firestore). Same layout as the Mission Rythm app.

## Setup
1. Create a **new** Firebase project. Enable **Authentication → Email/Password** and **Firestore**.
2. `cp .env.example .env` and fill in the web-app config values.
3. Paste `firestore.rules` into Firestore → Rules and publish.
4. `npm install && npm run dev`
5. **Sign up first yourself** — the first account ever created becomes an approved Web Dev / Admin. Everyone after that is pending.

## Structure
```
src/
  main.jsx  App.jsx  firebase.js  theme.css
  context/AuthContext.jsx        login, live profile (status + role)
  components/                    NavBar, ProtectedRoute, EmployeeForm
  lib/
    permissions.js               who can do what (edit rules here)
    users.js employees.js attendance.js payroll.js   Firestore access
    dates.js csv.js
  pages/
    LoginPage/  AwaitingApproval/  Attendance/  CreateEmployee/
    ManageEmployees/  Salaries/  Approvals/
```

## Firestore collections
users, employees, attendance (`{employeeId}_{date}`), payroll (`{YYYY-MM}`), payrollEntries (`{YYYY-MM}_{employeeId}`), meta/bootstrap

## Linking a login to an employee
An Employee sees "own" attendance/record by matching **login email == employee email**.

## Assumptions to confirm (all in `lib/payroll.js` / `lib/permissions.js`)
- Paid days = Present + 0.5 × Half day. Leave is **unpaid** (`LEAVE_IS_PAID`).
- EPF = 12% of earned salary, wage capped at ₹25,000. ESI = 0.75% of (earned + HRA), only if gross ≤ ₹21,000, rounded up.
- PT slabs are a placeholder: gross ≤ ₹21,000 → ₹150, above → ₹200. Type in the PT cell to override.
- Per the spec, Employees can also open/edit/finalize Salaries (`SALARY_ROLES`). Remove "Employee" there to restrict.
- Deleting an account removes its access record; the Firebase login itself must be removed in the Firebase console.
- "Today only" for Employee self-marking is enforced in the app, not in the Firestore rules.
