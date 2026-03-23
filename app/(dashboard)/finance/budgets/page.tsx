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
  costCenter: string | null;
  projectNumber: string | null;
  notes: string | null;
};

type Org = {
  id: string;
  name: string;
  code: string;
  costCenter: string | null;
  department: string | null;
  budgets: Budget[];
  unlinkedSpent: number;
  unlinkedReserved: number;
};

const inputCls = "w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy";

export default function FinanceBudgetsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [activeFY, setActiveFY] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  const [addingTo, setAddingTo] = useState<Org | null>(null);
  const [addForm, setAddForm] = useState({ name: "", fiscalYear: "", allocated: "", costCenter: "", projectNumber: "", notes: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const [editing, setEditing] = useState<{ org: Org; budget: Budget } | null>(null);
  const [editForm, setEditForm] = useState({ name: "", fiscalYear: "", allocated: "", costCenter: "", projectNumber: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { fetchBudgets(); }, [activeFY]);

  async function fetchBudgets() {
    setLoading(true);
    try {
      const params = activeFY ? `?fy=${encodeURIComponent(activeFY)}` : "";
      const res = await fetch(`/api/finance/budgets${params}`);
      const data = await res.json();
      const loaded: Org[] = data.orgs || [];
      setOrgs(loaded);
      if (data.fiscalYears?.length && !fiscalYears.length) {
        setFiscalYears(data.fiscalYears);
        // Default to most recent FY
        if (!activeFY && data.fiscalYears[0]) setActiveFY(data.fiscalYears[0]);
      }
      // Auto-expand first org that has budgets
      if (!expandedOrg) {
        const first = loaded.find((o) => o.budgets.length > 0);
        if (first) setExpandedOrg(first.id);
      }
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
      body: JSON.stringify({ ...addForm }),
    });
    if (res.ok) {
      setAddingTo(null);
      setAddForm({ name: "", fiscalYear: activeFY, allocated: "", costCenter: "", projectNumber: "", notes: "" });
      await fetchBudgets();
    } else {
      setAddError((await res.json()).error || "Failed");
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
      body: JSON.stringify({ budgetId: editing.budget.id, ...editForm }),
    });
    setEditing(null);
    await fetchBudgets();
    setEditSaving(false);
  }

  async function handleDelete(org: Org, b: Budget) {
    if (!confirm(`Delete "${b.name}" (${b.fiscalYear})? Linked requests will be unlinked.`)) return;
    await fetch(`/api/organizations/${org.id}/budgets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: b.id }),
    });
    await fetchBudgets();
  }

  function openEdit(org: Org, b: Budget) {
    setEditing({ org, budget: b });
    setEditForm({ name: b.name, fiscalYear: b.fiscalYear, allocated: String(b.allocated), costCenter: b.costCenter ?? "", projectNumber: b.projectNumber ?? "", notes: b.notes ?? "" });
  }

  const allBudgets = orgs.flatMap((o) => o.budgets);
  const totalAllocated = allBudgets.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = allBudgets.reduce((s, b) => s + b.spent, 0);
  const totalReserved = allBudgets.reduce((s, b) => s + b.reserved, 0);
  const totalUnlinkedSpent = orgs.reduce((s, o) => s + o.unlinkedSpent, 0);
  const totalUnlinkedReserved = orgs.reduce((s, o) => s + o.unlinkedReserved, 0);

  return (
    <div>
      <Header title="Budgets" subtitle="Allocations and spending across all organizations" />

      <div className="p-6 space-y-6">
        {/* Fiscal year selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-ink-muted">Fiscal Year:</span>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setActiveFY("")}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${!activeFY ? "bg-navy text-white border-navy" : "border-border text-ink-secondary hover:bg-paper"}`}
            >
              All
            </button>
            {fiscalYears.map((fy) => (
              <button
                key={fy}
                onClick={() => setActiveFY(fy)}
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${activeFY === fy ? "bg-navy text-white border-navy" : "border-border text-ink-secondary hover:bg-paper"}`}
              >
                {fy}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                const fy = prompt("New fiscal year label (e.g. FY2026):");
                if (fy && !fiscalYears.includes(fy)) setFiscalYears((p) => [fy, ...p].sort().reverse());
              }}
              className="text-xs text-navy hover:underline ml-2"
            >
              + Add FY
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Allocated" value={formatCurrency(totalAllocated)} />
          <StatCard label="Spent" value={formatCurrency(totalSpent)} color="text-red-600" />
          <StatCard label="Pending / In-Flight" value={formatCurrency(totalReserved)} color="text-amber-700" />
          <StatCard
            label="Available"
            value={formatCurrency(totalAllocated - totalSpent - totalReserved)}
            color={totalAllocated - totalSpent - totalReserved < 0 ? "text-red-600" : "text-green-700"}
          />
        </div>

        {totalUnlinkedSpent + totalUnlinkedReserved > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              <strong>{formatCurrency(totalUnlinkedSpent + totalUnlinkedReserved)}</strong> in requests is not linked to a specific budget across orgs with multiple budgets.
              These amounts are not reflected in any budget's totals above.
            </span>
          </div>
        )}

        {loading ? (
          <div className="card p-8 text-center text-sm text-ink-muted">Loading…</div>
        ) : (
          <div className="space-y-3">
            {orgs.map((org) => {
              const isOpen = expandedOrg === org.id;
              const orgAllocated = org.budgets.reduce((s, b) => s + b.allocated, 0);
              const orgSpent = org.budgets.reduce((s, b) => s + b.spent, 0);
              const orgReserved = org.budgets.reduce((s, b) => s + b.reserved, 0);
              const orgAvailable = orgAllocated - orgSpent - orgReserved;
              const usedPct = orgAllocated > 0 ? Math.min(100, ((orgSpent + orgReserved) / orgAllocated) * 100) : 0;

              return (
                <div key={org.id} className="card p-0 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-paper/50 transition-colors text-left gap-4"
                    onClick={() => setExpandedOrg(isOpen ? null : org.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <svg className={`w-4 h-4 text-ink-muted transition-transform flex-shrink-0 ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <div className="min-w-0">
                        <span className="font-semibold text-ink">{org.name}</span>
                        <span className="ml-2 text-xs text-ink-muted font-mono">{org.code}</span>
                        {org.costCenter && <span className="ml-2 text-xs text-ink-muted">· {org.costCenter}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-5 flex-shrink-0 text-sm">
                      {orgAllocated > 0 && (
                        <>
                          {/* Mini bar */}
                          <div className="hidden md:flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-green-500"}`}
                                style={{ width: `${usedPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-ink-muted">{Math.round(usedPct)}%</span>
                          </div>
                          <span className="text-xs text-ink-muted hidden lg:inline">{formatCurrency(orgAllocated)}</span>
                          <span className={`text-sm font-semibold ${orgAvailable < 0 ? "text-red-600" : "text-green-700"}`}>
                            {formatCurrency(orgAvailable)} left
                          </span>
                        </>
                      )}
                      <span className="text-xs text-ink-muted">{org.budgets.length} budget{org.budgets.length !== 1 ? "s" : ""}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border">
                      {org.budgets.length === 0 ? (
                        <div className="px-5 py-4 text-sm text-ink-muted">No budgets for this period.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-paper/50 border-b border-border">
                            <tr>
                              <th className="px-5 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Budget</th>
                              <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden sm:table-cell">FY</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">Allocated</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">Spent</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">Pending</th>
                              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">Available</th>
                              <th className="px-5 py-2.5 w-24" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {org.budgets.map((b) => {
                              const available = b.allocated - b.spent - b.reserved;
                              const pct = b.allocated > 0 ? Math.min(100, ((b.spent + b.reserved) / b.allocated) * 100) : 0;
                              return (
                                <tr key={b.id} className="hover:bg-paper/40 transition-colors group">
                                  <td className="px-5 py-3">
                                    <div className="font-medium text-ink">{b.name}</div>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                      {b.projectNumber && (
                                        <span className="text-xs font-mono bg-navy/10 text-navy px-1.5 py-0.5 rounded">{b.projectNumber}</span>
                                      )}
                                      {b.costCenter && (
                                        <span className="text-xs text-ink-muted font-mono">CC: {b.costCenter}</span>
                                      )}
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <div className="w-28 h-1 bg-border rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500"}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-ink-muted">{Math.round(pct)}%</span>
                                    </div>
                                    {b.notes && <div className="text-xs text-ink-muted mt-1">{b.notes}</div>}
                                  </td>
                                  <td className="px-4 py-3 text-xs text-ink-muted hidden sm:table-cell">{b.fiscalYear}</td>
                                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(b.allocated)}</td>
                                  <td className="px-4 py-3 text-right hidden md:table-cell">
                                    <span className={b.spent > 0 ? "text-red-600" : "text-ink-muted"}>{b.spent > 0 ? formatCurrency(b.spent) : "—"}</span>
                                  </td>
                                  <td className="px-4 py-3 text-right hidden md:table-cell">
                                    <span className={b.reserved > 0 ? "text-amber-700" : "text-ink-muted"}>{b.reserved > 0 ? formatCurrency(b.reserved) : "—"}</span>
                                  </td>
                                  <td className={`px-4 py-3 text-right font-semibold ${available < 0 ? "text-red-600" : available < b.allocated * 0.1 ? "text-amber-700" : "text-green-700"}`}>
                                    {formatCurrency(available)}
                                  </td>
                                  <td className="px-5 py-3">
                                    {isAdmin && (
                                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openEdit(org, b)} className="text-xs text-navy hover:underline">Edit</button>
                                        <button onClick={() => handleDelete(org, b)} className="text-xs text-red-600 hover:underline">Delete</button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}

                      {/* Unlinked spending warning */}
                      {(org.unlinkedSpent > 0 || org.unlinkedReserved > 0) && (
                        <div className="px-5 py-2.5 border-t border-border bg-amber-50 text-xs text-amber-800 flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatCurrency(org.unlinkedSpent + org.unlinkedReserved)} in requests not linked to a specific budget
                        </div>
                      )}

                      <div className="px-5 py-3 border-t border-border flex justify-between items-center bg-paper/30">
                        <Link href={`/organizations/${org.id}`} className="text-xs text-navy hover:underline">
                          View org →
                        </Link>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setAddingTo(org);
                              setAddForm({ name: "", fiscalYear: activeFY || new Date().getFullYear().toString(), allocated: "", costCenter: "", projectNumber: "", notes: "" });
                              setAddError("");
                            }}
                            className="text-xs px-3 py-1.5 bg-navy text-white rounded font-medium hover:bg-navy-light"
                          >
                            + Add Budget
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addingTo && (
        <Modal title={`Add Budget — ${addingTo.name}`} onClose={() => setAddingTo(null)}>
          <form onSubmit={handleAdd} className="space-y-3">
            {addError && <p className="text-sm text-red-600">{addError}</p>}
            <Field label="Budget nickname *">
              <input className={inputCls} value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="COE Budget" required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project number">
                <input className={inputCls} value={addForm.projectNumber} onChange={e => setAddForm(f => ({ ...f, projectNumber: e.target.value }))} placeholder="PJ20006" />
              </Field>
              <Field label="Cost center">
                <input className={inputCls} value={addForm.costCenter} onChange={e => setAddForm(f => ({ ...f, costCenter: e.target.value }))} placeholder="CC-1234" />
              </Field>
            </div>
            <Field label="Fiscal year *">
              <input className={inputCls} value={addForm.fiscalYear} onChange={e => setAddForm(f => ({ ...f, fiscalYear: e.target.value }))} placeholder="FY2026" required />
            </Field>
            <Field label="Allocated amount *">
              <input className={inputCls} type="number" step="0.01" min="0" value={addForm.allocated} onChange={e => setAddForm(f => ({ ...f, allocated: e.target.value }))} placeholder="25000.00" required />
            </Field>
            <Field label="Notes">
              <input className={inputCls} value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </Field>
            <ModalButtons onCancel={() => setAddingTo(null)} saving={addSaving} label="Add Budget" />
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit — ${editing.budget.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={handleEdit} className="space-y-3">
            <Field label="Budget nickname *">
              <input className={inputCls} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project number">
                <input className={inputCls} value={editForm.projectNumber} onChange={e => setEditForm(f => ({ ...f, projectNumber: e.target.value }))} placeholder="PJ20006" />
              </Field>
              <Field label="Cost center">
                <input className={inputCls} value={editForm.costCenter} onChange={e => setEditForm(f => ({ ...f, costCenter: e.target.value }))} placeholder="CC-1234" />
              </Field>
            </div>
            <Field label="Fiscal year *">
              <input className={inputCls} value={editForm.fiscalYear} onChange={e => setEditForm(f => ({ ...f, fiscalYear: e.target.value }))} required />
            </Field>
            <Field label="Allocated amount *">
              <input className={inputCls} type="number" step="0.01" min="0" value={editForm.allocated} onChange={e => setEditForm(f => ({ ...f, allocated: e.target.value }))} required />
            </Field>
            <Field label="Notes">
              <input className={inputCls} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
            <p className="text-xs text-ink-muted pt-1 border-t border-border">Spent/pending are computed live from linked requests.</p>
            <ModalButtons onCancel={() => setEditing(null)} saving={editSaving} label="Save" />
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
