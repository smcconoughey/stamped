"use client";

import { useState, useEffect } from "react";

const ROLES = ["STUDENT", "ORG_LEAD", "ADVISOR", "ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"];

type Tenant = {
  id: string;
  name: string;
  domain: string;
  slug: string;
  _count: { users: number; organizations: number };
  settings: any;
};

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  azureId: string | null;
};

type Org = {
  id: string;
  name: string;
  code: string;
  department: string | null;
  costCenter: string | null;
  _count: { members: number; requests: number };
};

export default function PlatformPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Expanded tenant state
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tenantUsers, setTenantUsers] = useState<Record<string, User[]>>({});
  const [tenantOrgs, setTenantOrgs] = useState<Record<string, Org[]>>({});
  const [expandTab, setExpandTab] = useState<Record<string, "users" | "orgs">>({});

  // Create tenant form
  const [form, setForm] = useState({ tenantName: "", domain: "", adminName: "", adminEmail: "", adminPassword: "" });

  // Add user form
  const [addingUser, setAddingUser] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ email: "", name: "", role: "STUDENT", password: "" });

  // Add org form
  const [addingOrg, setAddingOrg] = useState<string | null>(null);
  const [orgForm, setOrgForm] = useState({ name: "", code: "", department: "", costCenter: "", notes: "" });

  // Reset password modal
  const [resetUser, setResetUser] = useState<User & { tenantId: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // Edit role modal
  const [editRoleUser, setEditRoleUser] = useState<User & { tenantId: string } | null>(null);
  const [newRole, setNewRole] = useState("");

  useEffect(() => { fetchTenants(); }, []);

  async function fetchTenants() {
    setLoading(true);
    const res = await fetch("/api/platform/tenants");
    const data = await res.json();
    setTenants(data.tenants || []);
    setLoading(false);
  }

  async function fetchTenantData(tenantId: string, tab: "users" | "orgs") {
    if (tab === "users" && !tenantUsers[tenantId]) {
      const res = await fetch(`/api/platform/tenants/${tenantId}/users`);
      const data = await res.json();
      setTenantUsers(prev => ({ ...prev, [tenantId]: data.users || [] }));
    }
    if (tab === "orgs" && !tenantOrgs[tenantId]) {
      const res = await fetch(`/api/platform/tenants/${tenantId}/organizations`);
      const data = await res.json();
      setTenantOrgs(prev => ({ ...prev, [tenantId]: data.orgs || [] }));
    }
  }

  function toggleExpand(tenantId: string) {
    if (expanded === tenantId) {
      setExpanded(null);
    } else {
      setExpanded(tenantId);
      const tab = expandTab[tenantId] ?? "users";
      fetchTenantData(tenantId, tab);
    }
  }

  function switchTab(tenantId: string, tab: "users" | "orgs") {
    setExpandTab(prev => ({ ...prev, [tenantId]: tab }));
    fetchTenantData(tenantId, tab);
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/platform/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ tenantName: "", domain: "", adminName: "", adminEmail: "", adminPassword: "" });
      setShowCreate(false);
      fetchTenants();
    } else {
      const d = await res.json();
      alert(d.error);
    }
    setCreating(false);
  }

  async function addUser(tenantId: string, e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/platform/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, ...userForm }),
    });
    if (res.ok) {
      setAddingUser(null);
      setUserForm({ email: "", name: "", role: "STUDENT", password: "" });
      // Refresh users for this tenant
      setTenantUsers(prev => { const n = { ...prev }; delete n[tenantId]; return n; });
      fetchTenantData(tenantId, "users");
      fetchTenants();
    } else {
      const d = await res.json();
      alert(d.error);
    }
  }

  async function addOrg(tenantId: string, e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/platform/tenants/${tenantId}/organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orgForm),
    });
    if (res.ok) {
      setAddingOrg(null);
      setOrgForm({ name: "", code: "", department: "", costCenter: "", notes: "" });
      setTenantOrgs(prev => { const n = { ...prev }; delete n[tenantId]; return n; });
      fetchTenantData(tenantId, "orgs");
      fetchTenants();
    } else {
      const d = await res.json();
      alert(d.error);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser || !newPassword) return;
    setResetting(true);
    const res = await fetch(`/api/platform/tenants/${resetUser.tenantId}/users`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: resetUser.id, password: newPassword }),
    });
    if (res.ok) {
      setResetUser(null);
      setNewPassword("");
    } else {
      const d = await res.json();
      alert(d.error);
    }
    setResetting(false);
  }

  async function updateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editRoleUser) return;
    const res = await fetch(`/api/platform/tenants/${editRoleUser.tenantId}/users`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: editRoleUser.id, role: newRole }),
    });
    if (res.ok) {
      // Refresh users
      setTenantUsers(prev => { const n = { ...prev }; delete n[editRoleUser.tenantId]; return n; });
      fetchTenantData(editRoleUser.tenantId, "users");
      setEditRoleUser(null);
    } else {
      const d = await res.json();
      alert(d.error);
    }
  }

  async function deleteUser(user: User, tenantId: string) {
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    await fetch(`/api/platform/tenants/${tenantId}/users`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    setTenantUsers(prev => ({
      ...prev,
      [tenantId]: (prev[tenantId] || []).filter(u => u.id !== user.id),
    }));
    fetchTenants();
  }

  async function toggleUserActive(user: User, tenantId: string) {
    await fetch(`/api/platform/tenants/${tenantId}/users`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, active: !user.active }),
    });
    setTenantUsers(prev => ({
      ...prev,
      [tenantId]: (prev[tenantId] || []).map(u => u.id === user.id ? { ...u, active: !u.active } : u),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Tenants</h1>
          <p className="text-sm text-ink-secondary mt-1">Manage schools and institutions using Stamped.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light transition-colors"
        >
          Add Tenant
        </button>
      </div>

      {/* Create tenant modal */}
      {showCreate && (
        <Modal title="New Tenant" onClose={() => setShowCreate(false)}>
          <form onSubmit={createTenant} className="space-y-3">
            <Field label="Institution name" required>
              <input className={inputCls} value={form.tenantName} onChange={e => setForm(f => ({ ...f, tenantName: e.target.value }))} placeholder="Embry-Riddle Aeronautical University" required />
            </Field>
            <Field label="Email domain" required>
              <input className={inputCls} value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="erau.edu" required />
            </Field>
            <hr className="border-border" />
            <p className="text-xs text-ink-muted font-medium uppercase tracking-wide">First admin account</p>
            <Field label="Admin name">
              <input className={inputCls} value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} placeholder="Jane Smith" />
            </Field>
            <Field label="Admin email" required>
              <input className={inputCls} type="email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} placeholder="admin@erau.edu" required />
            </Field>
            <Field label="Admin password">
              <input className={inputCls} type="password" value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} placeholder="Leave blank = any password works" />
            </Field>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={creating} className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60">
                {creating ? "Creating..." : "Create Tenant"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className={cancelCls}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add user modal */}
      {addingUser && (
        <Modal title="Add User" onClose={() => setAddingUser(null)}>
          <form onSubmit={(e) => addUser(addingUser, e)} className="space-y-3">
            <Field label="Email" required>
              <input className={inputCls} type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="student@erau.edu" required />
            </Field>
            <Field label="Name">
              <input className={inputCls} value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="Alex Student" />
            </Field>
            <Field label="Role">
              <select className={inputCls} value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Password">
              <input className={inputCls} type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank = any password works" />
            </Field>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light">Add User</button>
              <button type="button" onClick={() => setAddingUser(null)} className={cancelCls}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add org modal */}
      {addingOrg && (
        <Modal title="Add Organization" onClose={() => setAddingOrg(null)}>
          <form onSubmit={(e) => addOrg(addingOrg, e)} className="space-y-3">
            <Field label="Organization name" required>
              <input className={inputCls} value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} placeholder="Robotics Club" required />
            </Field>
            <Field label="Code" required>
              <input className={inputCls} value={orgForm.code} onChange={e => setOrgForm(f => ({ ...f, code: e.target.value }))} placeholder="ROBO" required />
            </Field>
            <Field label="Department">
              <input className={inputCls} value={orgForm.department} onChange={e => setOrgForm(f => ({ ...f, department: e.target.value }))} placeholder="Engineering" />
            </Field>
            <Field label="Cost center">
              <input className={inputCls} value={orgForm.costCenter} onChange={e => setOrgForm(f => ({ ...f, costCenter: e.target.value }))} placeholder="CC-1234" />
            </Field>
            <Field label="Notes">
              <input className={inputCls} value={orgForm.notes} onChange={e => setOrgForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </Field>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light">Create Org</button>
              <button type="button" onClick={() => setAddingOrg(null)} className={cancelCls}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset password modal */}
      {resetUser && (
        <Modal title={`Reset password — ${resetUser.email}`} onClose={() => setResetUser(null)}>
          <form onSubmit={resetPassword} className="space-y-3">
            <Field label="New password" required>
              <input className={inputCls} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" required />
            </Field>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={resetting} className="flex-1 py-2 bg-stamp text-white text-sm font-semibold rounded-md hover:opacity-90 disabled:opacity-60">
                {resetting ? "Saving..." : "Reset Password"}
              </button>
              <button type="button" onClick={() => setResetUser(null)} className={cancelCls}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit role modal */}
      {editRoleUser && (
        <Modal title={`Change role — ${editRoleUser.email}`} onClose={() => setEditRoleUser(null)}>
          <form onSubmit={updateRole} className="space-y-3">
            <Field label="Role">
              <select className={inputCls} value={newRole} onChange={e => setNewRole(e.target.value)}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light">Save</button>
              <button type="button" onClick={() => setEditRoleUser(null)} className={cancelCls}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Tenant list */}
      {loading ? (
        <div className="text-sm text-ink-muted">Loading...</div>
      ) : tenants.length === 0 ? (
        <div className="bg-white border border-border rounded-lg p-12 text-center text-ink-muted text-sm">
          No tenants yet. Add your first school above.
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => {
            const isOpen = expanded === t.id;
            const tab = expandTab[t.id] ?? "users";
            const users = tenantUsers[t.id];
            const orgs = tenantOrgs[t.id];

            return (
              <div key={t.id} className="bg-white border border-border rounded-lg overflow-hidden">
                {/* Tenant header */}
                <div className="flex items-center justify-between px-5 py-4">
                  <button className="flex-1 text-left" onClick={() => toggleExpand(t.id)}>
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 text-ink-muted transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div>
                        <span className="font-semibold text-ink">{t.name}</span>
                        <span className="ml-3 text-xs text-ink-muted font-mono">{t.domain}</span>
                        <span className="ml-2 text-xs text-ink-muted">· slug: {t.slug}</span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-3 text-xs text-ink-secondary">
                    <span>{t._count.users} users</span>
                    <span>{t._count.organizations} orgs</span>
                  </div>
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div className="border-t border-border">
                    {/* Tabs */}
                    <div className="flex border-b border-border px-5">
                      <TabBtn active={tab === "users"} onClick={() => switchTab(t.id, "users")}>Users</TabBtn>
                      <TabBtn active={tab === "orgs"} onClick={() => switchTab(t.id, "orgs")}>Organizations</TabBtn>
                    </div>

                    {/* Users tab */}
                    {tab === "users" && (
                      <div className="p-4 space-y-2">
                        <div className="flex justify-end">
                          <button onClick={() => setAddingUser(t.id)} className="text-xs px-3 py-1.5 bg-navy text-white rounded font-medium hover:bg-navy-light">
                            + Add User
                          </button>
                        </div>
                        {!users ? (
                          <div className="text-xs text-ink-muted py-2">Loading...</div>
                        ) : users.length === 0 ? (
                          <div className="text-xs text-ink-muted py-2">No users yet.</div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-ink-muted border-b border-border">
                                <th className="text-left py-1.5 font-medium">Email</th>
                                <th className="text-left py-1.5 font-medium">Name</th>
                                <th className="text-left py-1.5 font-medium">Role</th>
                                <th className="text-left py-1.5 font-medium">SSO</th>
                                <th className="text-left py-1.5 font-medium">Status</th>
                                <th className="py-1.5" />
                              </tr>
                            </thead>
                            <tbody>
                              {users.map(u => (
                                <tr key={u.id} className="border-b border-border/50 last:border-0">
                                  <td className="py-2 text-ink font-mono text-xs">{u.email}</td>
                                  <td className="py-2 text-ink-secondary text-xs">{u.name || "—"}</td>
                                  <td className="py-2">
                                    <span className="text-xs font-mono bg-paper px-1.5 py-0.5 rounded">{u.role}</span>
                                  </td>
                                  <td className="py-2 text-xs text-ink-muted">{u.azureId ? "linked" : "—"}</td>
                                  <td className="py-2">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${u.active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                                      {u.active ? "active" : "disabled"}
                                    </span>
                                  </td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-2 justify-end">
                                      <button
                                        onClick={() => { setResetUser({ ...u, tenantId: t.id }); setNewPassword(""); }}
                                        className="text-xs text-navy hover:underline"
                                      >
                                        Reset pwd
                                      </button>
                                      <button
                                        onClick={() => { setEditRoleUser({ ...u, tenantId: t.id }); setNewRole(u.role); }}
                                        className="text-xs text-navy hover:underline"
                                      >
                                        Role
                                      </button>
                                      <button
                                        onClick={() => toggleUserActive(u, t.id)}
                                        className="text-xs text-ink-muted hover:underline"
                                      >
                                        {u.active ? "Disable" : "Enable"}
                                      </button>
                                      <button
                                        onClick={() => deleteUser(u, t.id)}
                                        className="text-xs text-red-500 hover:underline"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* Orgs tab */}
                    {tab === "orgs" && (
                      <div className="p-4 space-y-2">
                        <div className="flex justify-end">
                          <button onClick={() => setAddingOrg(t.id)} className="text-xs px-3 py-1.5 bg-navy text-white rounded font-medium hover:bg-navy-light">
                            + Add Organization
                          </button>
                        </div>
                        {!orgs ? (
                          <div className="text-xs text-ink-muted py-2">Loading...</div>
                        ) : orgs.length === 0 ? (
                          <div className="text-xs text-ink-muted py-2">No organizations yet.</div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-ink-muted border-b border-border">
                                <th className="text-left py-1.5 font-medium">Name</th>
                                <th className="text-left py-1.5 font-medium">Code</th>
                                <th className="text-left py-1.5 font-medium">Department</th>
                                <th className="text-left py-1.5 font-medium">Members</th>
                                <th className="text-left py-1.5 font-medium">Requests</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orgs.map(o => (
                                <tr key={o.id} className="border-b border-border/50 last:border-0">
                                  <td className="py-2 text-ink font-medium text-xs">{o.name}</td>
                                  <td className="py-2 font-mono text-xs">{o.code}</td>
                                  <td className="py-2 text-ink-secondary text-xs">{o.department || "—"}</td>
                                  <td className="py-2 text-ink-secondary text-xs">{o._count.members}</td>
                                  <td className="py-2 text-ink-secondary text-xs">{o._count.requests}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${active ? "border-navy text-navy" : "border-transparent text-ink-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">
        {label}{required && <span className="text-stamp ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy";
const cancelCls = "px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper";
