"use client";

import { useState, useEffect } from "react";

const ROLES = ["STUDENT", "ORG_LEAD", "ADVISOR", "ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"];

export default function PlatformPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [addingUser, setAddingUser] = useState<string | null>(null); // tenantId

  // Create tenant form
  const [form, setForm] = useState({
    tenantName: "", domain: "", adminName: "", adminEmail: "", adminPassword: "",
  });

  // Add user form
  const [userForm, setUserForm] = useState({
    email: "", name: "", role: "STUDENT", password: "",
  });

  useEffect(() => { fetchTenants(); }, []);

  async function fetchTenants() {
    setLoading(true);
    const res = await fetch("/api/platform/tenants");
    const data = await res.json();
    setTenants(data.tenants || []);
    setLoading(false);
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
      fetchTenants();
    } else {
      const d = await res.json();
      alert(d.error);
    }
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-ink mb-4">New Tenant</h2>
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
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add user modal */}
      {addingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-ink mb-4">Add User to Tenant</h2>
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
                <button type="submit" className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light">
                  Add User
                </button>
                <button type="button" onClick={() => setAddingUser(null)} className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tenant list */}
      {loading ? (
        <div className="text-sm text-ink-muted">Loading...</div>
      ) : tenants.length === 0 ? (
        <div className="bg-white border border-border rounded-lg p-12 text-center text-ink-muted text-sm">
          No tenants yet. Add your first school above.
        </div>
      ) : (
        <div className="space-y-4">
          {tenants.map((t) => (
            <div key={t.id} className="bg-white border border-border rounded-lg p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-ink">{t.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-ink-muted font-mono">{t.domain}</span>
                    <span className="text-xs text-ink-muted">slug: {t.slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-ink-secondary">
                  <span>{t._count.users} users</span>
                  <span>{t._count.organizations} orgs</span>
                  <button
                    onClick={() => setAddingUser(t.id)}
                    className="px-3 py-1.5 border border-border rounded text-xs font-medium hover:bg-paper transition-colors"
                  >
                    Add User
                  </button>
                </div>
              </div>

              {t.settings && (
                <div className="mt-3 pt-3 border-t border-border flex gap-4 text-xs text-ink-muted">
                  <span>Prefix: <code className="font-mono">{t.settings.requestPrefix}</code></span>
                  <span>Advisor approval: {t.settings.requireAdvisorApproval ? "required" : "optional"}</span>
                  {t.settings.msMailboxAddress && <span>Mailbox: {t.settings.msMailboxAddress}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
