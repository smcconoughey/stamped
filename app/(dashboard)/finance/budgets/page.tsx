"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { formatCurrency } from "@/lib/utils";

type Budget = {
  id: string;
  name: string;
  fiscalYear: string;
  allocated: number;
  spent: number;
  reserved: number;
  notes: string | null;
};

type Org = {
  id: string;
  name: string;
  code: string;
  costCenter: string | null;
  department: string | null;
  budgets: Budget[];
};

const inputCls = "w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy";

export default function FinanceBudgetsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  // Add budget modal
  const [addingTo, setAddingTo] = useState<Org | null>(null);
  const [addForm, setAddForm] = useState({ name: "", fiscalYear: "", allocated: "", notes: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit budget modal
  const [editing, setEditing] = useState<{ org: Org; budget: Budget } | null>(null);
  const [editForm, setEditForm] = useState({ name: "", fiscalYear: "", allocated: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { fetchBudgets(); }, []);

  async function fetchBudgets() {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/budgets");
      const data = await res.json();
      setOrgs(data.orgs || []);
      // Auto-expand first org with budgets
      const first = (data.orgs || []).find((o: Org) => o.budgets.length > 0);
      if (first && !expandedOrg) setExpandedOrg(first.id);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addingTo) return;
    setAddSaving(true);
    setAddError("");
    const res = await fetch(`/api/organizations/${addingTo.id}/budgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addForm.name, fiscalYear: addForm.fiscalYear, allocated: addForm.allocated, notes: addForm.notes }),
    });
    if (res.ok) {
      setAddingTo(null);
      setAddForm({ name: "", fiscalYear: "", allocated: "", notes: "" });
      await fetchBudgets();
    } else {
      const d = await res.json();
      setAddError(d.error || "Failed to create budget");
    }
    setAddSaving(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    await fetch(`/api/organizations/${editing.org.id}/budgets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: editing.budget.id, name: editForm.name, fiscalYear: editForm.fiscalYear, allocated: editForm.allocated, notes: editForm.notes }),
    });
    setEditing(null);
    await fetchBudgets();
    setEditSaving(false);
  }

  async function handleDelete(org: Org, budget: Budget) {
    if (!confirm(`Delete "${budget.name}" (${budget.fiscalYear})? Requests linked to it will be unlinked.`)) return;
    await fetch(`/api/organizations/${org.id}/budgets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: budget.id }),
    });
    await fetchBudgets();
  }

  function openEdit(org: Org, b: Budget) {
    setEditing({ org, budget: b });
    setEditForm({ name: b.name, fiscalYear: b.fiscalYear, allocated: String(b.allocated), notes: b.notes ?? "" });
  }

  // Totals across all orgs
  const totalAllocated = orgs.flatMap((o) => o.budgets).reduce((s, b) => s + b.allocated, 0);
  const totalSpent = orgs.flatMap((o) => o.budgets).reduce((s, b) => s + b.spent, 0);
  const totalReserved = orgs.flatMap((o) => o.budgets).reduce((s, b) => s + b.reserved, 0);

  return (
    <div>
      <Header
        title="Budgets"
        subtitle="Manage allocations across all organizations"
      />

      <div className="p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Allocated" value={formatCurrency(totalAllocated)} />
          <StatCard label="Spent" value={formatCurrency(totalSpent)} color="text-red-600" />
          <StatCard label="Reserved" value={formatCurrency(totalReserved)} color="text-amber-600" />
          <StatCard
            label="Available"
            value={formatCurrency(totalAllocated - totalSpent - totalReserved)}
            color={totalAllocated - totalSpent - totalReserved < 0 ? "text-red-600" : "text-green-700"}
          />
        </div>

        {loading ? (
          <div className="card p-8 text-center text-sm text-ink-muted">Loading budgets…</div>
        ) : orgs.length === 0 ? (
          <div className="card p-12 text-center text-sm text-ink-muted">
            No organizations found. <Link href="/organizations" className="text-navy hover:underline">Create one first.</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => {
              const isOpen = expandedOrg === org.id;
              const orgAllocated = org.budgets.reduce((s, b) => s + b.allocated, 0);
              const orgSpent = org.budgets.reduce((s, b) => s + b.spent, 0);
              const orgReserved = org.budgets.reduce((s, b) => s + b.reserved, 0);
              const orgAvailable = orgAllocated - orgSpent - orgReserved;

              return (
                <div key={org.id} className="card p-0 overflow-hidden">
                  {/* Org header */}
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-paper/50 transition-colors text-left"
                    onClick={() => setExpandedOrg(isOpen ? null : org.id)}
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-4 h-4 text-ink-muted transition-transform flex-shrink-0 ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <div>
                        <span className="font-semibold text-ink">{org.name}</span>
                        <span className="ml-2 text-xs text-ink-muted font-mono">{org.code}</span>
                        {org.costCenter && <span className="ml-2 text-xs text-ink-muted">CC: {org.costCenter}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-ink-muted text-xs">{org.budgets.length} budget{org.budgets.length !== 1 ? "s" : ""}</span>
                      {orgAllocated > 0 && (
                        <>
                          <span className="text-ink-secondary hidden md:inline">{formatCurrency(orgAllocated)} allocated</span>
                          <span className={`font-medium hidden lg:inline ${orgAvailable < 0 ? "text-red-600" : "text-green-700"}`}>
                            {formatCurrency(orgAvailable)} available
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  {/* Expanded budgets */}
                  {isOpen && (
                    <div className="border-t border-border">
                      {org.budgets.length === 0 ? (
                        <div className="px-5 py-4 text-sm text-ink-muted">No budgets yet.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-paper/50 border-b border-border">
                            <tr>
                              <th className="px-5 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Budget</th>
                              <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden sm:table-cell">Year</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">Allocated</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">Spent</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">Reserved</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">Available</th>
                              <th className="px-4 py-2.5 w-28" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {org.budgets.map((b) => {
                              const available = b.allocated - b.spent - b.reserved;
                              const usedPct = b.allocated > 0 ? Math.min(100, ((b.spent + b.reserved) / b.allocated) * 100) : 0;
                              return (
                                <tr key={b.id} className="hover:bg-paper/40 transition-colors group">
                                  <td className="px-5 py-3">
                                    <div className="font-medium text-ink">{b.name}</div>
                                    {/* mini progress bar */}
                                    <div className="mt-1 w-32 h-1 bg-border rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-green-500"}`}
                                        style={{ width: `${usedPct}%` }}
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 hidden sm:table-cell text-xs text-ink-muted">{b.fiscalYear}</td>
                                  <td className="px-4 py-3 text-right text-sm font-medium">{formatCurrency(b.allocated)}</td>
                                  <td className="px-4 py-3 text-right text-sm text-red-600 hidden md:table-cell">{b.spent > 0 ? formatCurrency(b.spent) : "—"}</td>
                                  <td className="px-4 py-3 text-right text-sm text-amber-700 hidden md:table-cell">{b.reserved > 0 ? formatCurrency(b.reserved) : "—"}</td>
                                  <td className={`px-4 py-3 text-right text-sm font-semibold ${available < 0 ? "text-red-600" : available < b.allocated * 0.1 ? "text-amber-700" : "text-green-700"}`}>
                                    {formatCurrency(available)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {isAdmin && (
                                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => openEdit(org, b)}
                                          className="text-xs text-navy hover:underline"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleDelete(org, b)}
                                          className="text-xs text-red-600 hover:underline"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      <div className="px-5 py-3 border-t border-border flex justify-between items-center">
                        <Link href={`/organizations/${org.id}`} className="text-xs text-navy hover:underline">
                          View org detail →
                        </Link>
                        <button
                          onClick={() => { setAddingTo(org); setAddForm({ name: "", fiscalYear: new Date().getFullYear().toString(), allocated: "", notes: "" }); setAddError(""); }}
                          className="text-xs px-3 py-1.5 bg-navy text-white rounded font-medium hover:bg-navy-light"
                        >
                          + Add Budget
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add budget modal */}
      {addingTo && (
        <Modal title={`Add Budget — ${addingTo.name}`} onClose={() => setAddingTo(null)}>
          <form onSubmit={handleAdd} className="space-y-3">
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <Field label="Budget name *">
              <input className={inputCls} value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="COE Budget" required />
            </Field>
            <Field label="Fiscal year *">
              <input className={inputCls} value={addForm.fiscalYear} onChange={e => setAddForm(f => ({ ...f, fiscalYear: e.target.value }))} placeholder="FY2025" required />
            </Field>
            <Field label="Allocated amount *">
              <input className={inputCls} type="number" step="0.01" min="0" value={addForm.allocated} onChange={e => setAddForm(f => ({ ...f, allocated: e.target.value }))} placeholder="5000.00" required />
            </Field>
            <Field label="Notes">
              <input className={inputCls} value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </Field>
            <ModalButtons onCancel={() => setAddingTo(null)} saving={addSaving} label="Add Budget" />
          </form>
        </Modal>
      )}

      {/* Edit budget modal */}
      {editing && (
        <Modal title={`Edit Budget — ${editing.budget.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={handleEdit} className="space-y-3">
            <Field label="Budget name *">
              <input className={inputCls} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
            </Field>
            <Field label="Fiscal year *">
              <input className={inputCls} value={editForm.fiscalYear} onChange={e => setEditForm(f => ({ ...f, fiscalYear: e.target.value }))} required />
            </Field>
            <Field label="Allocated amount *">
              <input className={inputCls} type="number" step="0.01" min="0" value={editForm.allocated} onChange={e => setEditForm(f => ({ ...f, allocated: e.target.value }))} required />
            </Field>
            <Field label="Notes">
              <input className={inputCls} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
            <div className="pt-1 text-xs text-ink-muted border-t border-border">
              Spent and reserved amounts are computed automatically from linked requests.
            </div>
            <ModalButtons onCancel={() => setEditing(null)} saving={editSaving} label="Save Changes" />
          </form>
        </Modal>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold tracking-widest uppercase text-ink-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1">{label}</label>
      {children}
    </div>
  );
}

function ModalButtons({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="submit" disabled={saving} className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60">
        {saving ? "Saving…" : label}
      </button>
      <button type="button" onClick={onCancel} className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
        Cancel
      </button>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
