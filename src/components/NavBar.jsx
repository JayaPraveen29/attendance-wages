// components/NavBar.jsx
// Sidebar on desktop, hamburger drawer on mobile. Links come from ONE list.

import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  canManageEmployees, canApprove, canUseSalaries, roleLabel,
} from "../lib/permissions";
import "./NavBar.css";

const BRAND = "Payroll Management";

const ICONS = {
  attendance: <path d="M8 2v3M16 2v3M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm4 11 2 2 4-4" />,
  create: <path d="M15 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm9-2v6m3-3h-6" />,
  employees: <path d="M17 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m8-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm13 9v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8" />,
  salaries: <path d="M6 4h12M6 9h12M9 4c5 0 6 5 0 5l7 8M4 4h0" />,
  payslip: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  biodata: <path d="M4 4h16v16H4zM9 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-3 6c0-2 1.5-3 3-3s3 1 3 3M14 8h4M14 12h4" />,
  approvals: <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zm-3 9 2.2 2.2L15.5 10" />,
};
const Icon = ({ name }) => (
  <svg className="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICONS[name]}
  </svg>
);
const initials = (n = "") => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

export default function NavBar() {
  const { profile, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!profile) return null;

  const links = [
    { to: "/attendance", label: "Attendance", icon: "attendance", show: true },
    { to: "/employees/new", label: "Create employee", icon: "create", show: canManageEmployees(profile) },
    { to: "/employees", label: "Manage employees", icon: "employees", show: canManageEmployees(profile), end: true },
    { to: "/salaries", label: "Salaries", icon: "salaries", show: canUseSalaries(profile) },
    { to: "/payslip", label: "Payslip", icon: "payslip", show: canUseSalaries(profile) },
    { to: "/biodata", label: "List of employees", icon: "biodata", show: canManageEmployees(profile) },
    { to: "/approvals", label: "Approvals", icon: "approvals", show: canApprove(profile) },
  ].filter((l) => l.show);

  const close = () => setMenuOpen(false);
  const cls = ({ isActive }) => (isActive ? "active" : "");
  const who = (
    <span className="who">
      <span className="avatar">{initials(profile.name)}</span>
      <span className="who-text"><strong>{profile.name}</strong><small>{roleLabel(profile.role)}</small></span>
    </span>
  );

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">{BRAND}</span>
        </div>
        <nav className="sidebar-links">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={cls}><Icon name={l.icon} />{l.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="sidebar-role">{who}</span>
          <button type="button" className="sidebar-logout" onClick={logout}>Logout</button>
        </div>
      </aside>

      <header className="mobile-header">
        <button type="button" className="hamburger-btn" onClick={() => setMenuOpen(true)}
          aria-label="Open navigation menu" aria-expanded={menuOpen}>
          <span></span><span></span><span></span>
        </button>
        <div className="mobile-brand"><span className="mobile-brand-name">{BRAND}</span></div>
      </header>

      {menuOpen && <div className="mobile-menu-overlay" onClick={close} aria-hidden="true" />}

      <aside className={`mobile-drawer ${menuOpen ? "open" : ""}`} aria-hidden={!menuOpen}>
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-brand"><span>{BRAND}</span></div>
          <button type="button" className="mobile-close-btn" onClick={close} aria-label="Close navigation menu">×</button>
        </div>
        <div className="mobile-drawer-divider"></div>
        <nav className="mobile-drawer-links">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={cls} onClick={close}><Icon name={l.icon} />{l.label}</NavLink>
          ))}
        </nav>
        <div className="mobile-drawer-user">
          <span className="mobile-drawer-role">{who}</span>
          <button type="button" className="mobile-drawer-logout" onClick={() => { close(); logout(); }}>Logout</button>
        </div>
      </aside>
    </>
  );
}