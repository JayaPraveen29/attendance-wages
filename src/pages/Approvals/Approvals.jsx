// pages/Approvals/Approvals.jsx
// Admin / Director: approve or reject new accounts, change anyone's role
// (including your own), delete accounts (not your own).
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listenUsers, approveUser, rejectUser, changeRole, deleteUserAccess } from "../../lib/users";
import { ROLES, roleLabel, roleChangeBlockReason, deleteBlockReason } from "../../lib/permissions";

const TABS = [
  { label: "Pending", status: "pending" },
  { label: "Approved", status: "approved" },
  { label: "Rejected", status: "rejected" },
];

export default function Approvals() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(TABS[0]);
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({}); // uid -> role chosen in the dropdown
  const [busyUid, setBusyUid] = useState(null);
  const [notice, setNotice] = useState({ type: "", text: "" });

  useEffect(() => listenUsers(setUsers, (e) => setNotice({ type: "error", text: e.message })), []);

  const list = users.filter((u) => u.status === tab.status);
  const roleFor = (u) => drafts[u.uid] || u.role || u.requestedRole || "Employee";

  const act = async (u, fn, okText) => {
    setBusyUid(u.uid);
    try { await fn(); setNotice({ type: "ok", text: okText }); }
    catch (e) { setNotice({ type: "error", text: e.message }); }
    finally { setBusyUid(null); }
  };

  const saveRole = (u) => {
    const role = roleFor(u);
    const block = roleChangeBlockReason(profile, u, role, users);
    if (block) return setNotice({ type: "error", text: block });
    act(u, () => changeRole(u.uid, role), `${u.name} is now ${roleLabel(role)}.`);
  };

  const remove = (u) => {
    const block = deleteBlockReason(profile, u);
    if (block) return setNotice({ type: "error", text: block });
    if (!window.confirm(`Delete the account of ${u.name} (${u.email})? They will lose all access.`)) return;
    act(u, () => deleteUserAccess(u.uid), `${u.name}'s account was deleted.`);
  };

  return (
    <div className="page">
      <h1>Approvals</h1>
      <p className="sub">The role a person picked at sign-up is only a request — you can keep or change it.</p>
      {notice.text && <div className={`msg ${notice.type}`}>{notice.text}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.status} className={`tab ${tab.status === t.status ? "active" : ""}`} onClick={() => setTab(t)}>
            {t.label} ({users.filter((u) => u.status === t.status).length})
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Requested</th><th>Role</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const isMe = u.uid === profile.uid;
              const busy = busyUid === u.uid;
              return (
                <tr key={u.uid}>
                  <td>{u.name}{isMe && <> <span className="badge grey">you</span></>}</td>
                  <td>{u.email}</td>
                  <td>{roleLabel(u.requestedRole)}</td>
                  <td>
                    <select className="input" value={roleFor(u)} disabled={busy}
                      onChange={(e) => setDrafts({ ...drafts, [u.uid]: e.target.value })}>
                      {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                    </select>
                  </td>
                  <td>
                    <div className="toolbar" style={{ margin: 0 }}>
                      {tab.status === "pending" && (
                        <>
                          <button className="btn small" disabled={busy}
                            onClick={() => act(u, () => approveUser(u.uid, roleFor(u), profile.name), `${u.name} approved as ${roleLabel(roleFor(u))}.`)}>Approve</button>
                          <button className="btn small secondary" disabled={busy}
                            onClick={() => act(u, () => rejectUser(u.uid, profile.name), `${u.name} was rejected.`)}>Reject</button>
                        </>
                      )}
                      {tab.status === "approved" && (
                        <button className="btn small" disabled={busy || roleFor(u) === u.role} onClick={() => saveRole(u)}>Save role</button>
                      )}
                      {tab.status === "rejected" && (
                        <button className="btn small" disabled={busy}
                          onClick={() => act(u, () => approveUser(u.uid, roleFor(u), profile.name), `${u.name} approved as ${roleLabel(roleFor(u))}.`)}>Approve</button>
                      )}
                      {!isMe && <button className="btn small danger" disabled={busy} onClick={() => remove(u)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={5} className="empty">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
