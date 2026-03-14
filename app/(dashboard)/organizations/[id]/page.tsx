"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatCurrency } from "@/lib/utils";
import { Header } from "@/components/layout/header";
import Link from "next/link";

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
  department: string | null;
  costCenter: string | null;
  budgets: Budget[];
};

type Request = {
  id: string;
  number: string;
  title: string;
  status: string;
  vendorName: string | null;
  totalEstimated: number | null;
  totalActual: number | null;
  orderedAt: string | null;
  receivedAt: string | null;
  budgetId: string | null;
  submittedBy: { name: string | null; email: string };
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-blue-100 text-blue-700",
  PENDING_APPROVAL: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  ORDERED: "bg-purple-100 text-purple-700",
  PARTIALLY_RECEIVED: "bg-indigo-100 text-indigo-700",
  RECEIVED: "bg-green-100 text-green-700",
  READY_FOR_PICKUP: "bg-teal-100 text-teal-700",
  PICKED_UP: "bg-green-200 text-green-800",
  CANCELLED: "bg-red-100 text-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending",
  APPROVED: "Approved",
  ORDERED: "Ordered",
  PARTIALLY_RECEIVED: "Part. Rcvd",
  RECEIVED: "Received",
  READY_FOR_PICKUP: "Ready",
  PICKED_UP: "Picked Up",
  CANCELLED: "Cancelled",
};

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  const canManageBudgets = isAdmin || user?.role === "ORG_LEAD";

  const [org, setOrg] = useState<Org | null>(null);
  const [unlinkedSpent, setUnlinkedSpent] = useState(0);
  const [unlinkedReserved, setUnlinkedReserved] = useState(0);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBudget, setActiveBudget] = useState<string | null>(null);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ name: "", fiscalYear: "", allocated: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Edit budget modal
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [editForm, setEditForm] = useState({ name: "", fiscalYear: "", allocated: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchAll(); }, [id]);

  async function fetchAll() {
    setLoading(true);
    const [orgRes, reqRes] = await Promise.all([
      fetch(`/api/organizations/${id}`),
      fetch(`/api/requests?orgId=${id}&limit=500`),
    ]);
    const orgData = await orgRes.json();
    const reqData = await reqRes.json();
    setOrg(orgData.org);
    setUnlinkedSpent(orgData.unlinkedSpent ?? 0);
    setUnlinkedReserved(orgData.unlinkedReserved ?? 0);
    setRequests((reqData.requests ?? []).filter((r: Request) => r.status !== "CANCELLED"));
    if (orgData.org?.budgets?.length > 0 && !activeBudget) {
      setActiveBudget(orgData.org.budgets[0].id);
    }
    setLoading(false);
  }

  async function addBudget(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/organizations/${id}/budgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: budgetForm.name,
        fiscalYear: budgetForm.fiscalYear,
        allocated: parseFloat(budgetForm.allocated),
        notes: budgetForm.notes || null,
      }),
    });
    if (res.ok) {
      setShowAddBudget(false);
      setBudgetForm({ name: "", fiscalYear: "", allocated: "", notes: "" });
      await fetchAll();
    } else {
      const d = await res.json();
      setError(d.error || "Failed to create budget");
    }
    setSaving(false);
  }

  function openEdit(b: Budget) {
    setEditBudget(b);
    setEditForm({ name: b.name, fiscalYear: b.fiscalYear, allocated: String(b.allocated), notes: b.notes ?? "" });
    setEditError("");
    setConfirmDelete(false);
  }

  async function saveBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!editBudget) return;
    setEditSaving(true);
    setEditError("");
    const res = await fetch(`/api/organizations/${id}/budgets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetId: editBudget.id,
        name: editForm.name,
        fiscalYear: editForm.fiscalYear,
        allocated: parseFloat(editForm.allocated),
        notes: editForm.notes || null,
      }),
    });
    if (res.ok) {
      setEditBudget(null);
      await fetchAll();
    } else {
      const d = await res.json();
      setEditError(d.error || "Failed to save");
    }
    setEditSaving(false);
  }

  async function deleteBudget() {
    if (!editBudget) return;
    setDeleting(true);
    const res = await fetch(`/api/organizations/${id}/budgets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: editBudget.id }),
    });
    if (res.ok) {
      setEditBudget(null);
      setActiveBudget(null);
      await fetchAll();
    } else {
      const d = await res.json();
      setEditError(d.error || "Failed to delete");
    }
    setDeleting(false);
    setConfirmDelete(false);
  }

  if (loading) return (
    <div>
      <Header title="Organization" subtitle="" />
      <div className="p-6 text-sm text-ink-muted">Loading...</div>
    </div>
  );

  if (!org) return (
    <div>
      <Header title="Organization" subtitle="" />
      <div className="p-6 text-sm text-red-600">Organization not found.</div>
    </div>
  );

  const selectedBudget = org.budgets.find(b => b.id === activeBudget) ?? org.budgets[0] ?? null;
  const available = selectedBudget
    ? selectedBudget.allocated - selectedBudget.spent - selectedBudget.reserved
    : null;
  const usedPct = selectedBudget && selectedBudget.allocated > 0
    ? Math.min(100, ((selectedBudget.spent + selectedBudget.reserved) / selectedBudget.allocated) * 100)
    : 0;

  // Line items for the selected budget tab
  // "Unlinked" pseudo-tab: show requests with no budgetId (only when org has multiple budgets)
  const isUnlinkedTab = activeBudget === "__unlinked__";
  const budgetLineItems = isUnlinkedTab
    ? requests.filter(r => !r.budgetId)
    : requests.filter(r => r.budgetId === activeBudget);

  // Also show unlinked items under the single budget when org has only one budget
  const singleBudget = org.budgets.length === 1 ? org.budgets[0] : null;
  const lineItems = singleBudget && activeBudget === singleBudget.id
    ? requests.filter(r => r.budgetId === activeBudget || !r.budgetId)
    : budgetLineItems;

  const totalShown = lineItems.reduce((sum, r) => sum + ((r.totalActual ?? r.totalEstimated) ?? 0), 0);

  return (
    <div>
      <Header
        title={org.name}
        subtitle={[org.code, org.department, org.costCenter].filter(Boolean).join(" · ")}
      />

      <div className="p-6 space-y-6">
        {/* Budget tabs */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center border-b border-border px-4">
            <div className="flex overflow-x-auto">
              {org.budgets.map(b => (
                <div key={b.id} className="flex items-center">
                  <button
                    onClick={() => setActiveBudget(b.id)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      activeBudget === b.id
                        ? "border-navy text-navy"
                        : "border-transparent text-ink-muted hover:text-ink"
                    }`}
                  >
                    {b.name}
                    <span className="ml-2 text-xs text-ink-muted font-normal">{b.fiscalYear}</span>
                  </button>
                  {canManageBudgets && activeBudget === b.id && (
                    <button
                      onClick={() => openEdit(b)}
                      className="ml-0.5 p-1 rounded text-ink-muted hover:text-ink hover:bg-paper transition-colors"
                      title="Edit budget"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.293-6.293a1 1 0 011.414 0l1.586 1.586a1 1 0 010 1.414L12 14H9v-3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {/* Unlinked tab — only when org has multiple budgets AND there are unlinked requests */}
              {org.budgets.length > 1 && (unlinkedSpent > 0 || unlinkedReserved > 0) && (
                <button
                  onClick={() => setActiveBudget("__unlinked__")}
                  className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isUnlinkedTab
                      ? "border-amber-500 text-amber-700"
                      : "border-transparent text-amber-600 hover:text-amber-800"
                  }`}
                >
                  Unlinked
                </button>
              )}
            </div>
            <button
              onClick={() => setShowAddBudget(true)}
              className="ml-auto shrink-0 text-xs text-navy hover:underline px-3 py-3"
            >
              + Add Budget
            </button>
          </div>

          {org.budgets.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-muted">
              No budgets yet.{" "}
              <button onClick={() => setShowAddBudget(true)} className="text-navy hover:underline">
                Add one
              </button>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {!isUnlinkedTab && selectedBudget && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <BudgetStat label="Allocated" value={formatCurrency(selectedBudget.allocated)} />
                    <BudgetStat label="Spent" value={formatCurrency(selectedBudget.spent)} />
                    <BudgetStat label="Reserved" value={formatCurrency(selectedBudget.reserved)} />
                    <BudgetStat
                      label="Available"
                      value={available != null ? formatCurrency(available) : "—"}
                      color={
                        available == null ? undefined
                        : available < 0 ? "text-red-600"
                        : available < 500 ? "text-amber-700"
                        : "text-green-700"
                      }
                    />
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                      <span>Budget used</span>
                      <span>{Math.round(usedPct)}%</span>
                    </div>
                    <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-green-500"
                        }`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                    {selectedBudget.notes && (
                      <p className="mt-2 text-sm text-ink-secondary">{selectedBudget.notes}</p>
                    )}
                  </div>
                </>
              )}

              {isUnlinkedTab && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                  These requests have no budget assigned. Link them to a budget from the{" "}
                  <Link href="/requests" className="underline">All Requests</Link> page.
                </div>
              )}

              {/* Line items table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                    Line Items
                    <span className="ml-2 font-normal normal-case">({lineItems.length})</span>
                  </p>
                  {totalShown > 0 && (
                    <p className="text-xs text-ink-muted">
                      Total: <span className="font-semibold text-ink">{formatCurrency(totalShown)}</span>
                    </p>
                  )}
                </div>

                {lineItems.length === 0 ? (
                  <p className="text-sm text-ink-muted py-4 text-center">No requests linked to this budget.</p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-paper border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-ink-muted">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-ink-muted">Item</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-ink-muted">Vendor</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-ink-muted">Status</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-ink-muted">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lineItems.map(r => {
                          const amount = r.totalActual ?? r.totalEstimated;
                          return (
                            <tr key={r.id} className="hover:bg-paper/60 transition-colors">
                              <td className="px-3 py-2 font-mono text-xs text-ink-muted whitespace-nowrap">
                                <Link href={`/requests/${r.id}`} className="hover:text-navy hover:underline">
                                  {r.number}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-ink max-w-[220px]">
                                <Link href={`/requests/${r.id}`} className="hover:text-navy hover:underline line-clamp-1">
                                  {r.title}
                                </Link>
                                <p className="text-xs text-ink-muted">{r.submittedBy.name ?? r.submittedBy.email}</p>
                              </td>
                              <td className="px-3 py-2 text-ink-secondary text-xs max-w-[140px] truncate">
                                {r.vendorName ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                                  {STATUS_LABELS[r.status] ?? r.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-ink whitespace-nowrap">
                                {amount != null ? (
                                  <span>
                                    {formatCurrency(amount)}
                                    {r.totalActual == null && <span className="text-ink-muted text-xs ml-1">(est)</span>}
                                  </span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {lineItems.length > 1 && (
                        <tfoot className="bg-paper border-t-2 border-border">
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-ink-muted text-right">Total</td>
                            <td className="px-3 py-2 text-right text-sm font-bold text-ink">{formatCurrency(totalShown)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Edit budget modal */}
        {editBudget && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-ink">Edit Budget</h2>
                <button onClick={() => { setEditBudget(null); setConfirmDelete(false); }} className="text-ink-muted hover:text-ink text-xl">&times;</button>
              </div>
              {editError && <div className="mb-4 text-sm text-red-600">{editError}</div>}
              <form onSubmit={saveBudget} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Budget name</label>
                  <input className={inputCls} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Fiscal year</label>
                  <input className={inputCls} value={editForm.fiscalYear} onChange={e => setEditForm(f => ({ ...f, fiscalYear: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Allocated amount</label>
                  <input className={inputCls} type="number" step="0.01" min="0" value={editForm.allocated} onChange={e => setEditForm(f => ({ ...f, allocated: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                  <textarea className={inputCls} rows={2} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={editSaving} className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60">
                    {editSaving ? "Saving..." : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => { setEditBudget(null); setConfirmDelete(false); }} className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
                    Cancel
                  </button>
                </div>
              </form>
              {isAdmin && (
                <div className="mt-4 pt-4 border-t border-border">
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full py-2 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                    >
                      Delete Budget
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-ink">
                        Delete <strong>{editBudget.name}</strong>? Requests will be unlinked but not deleted.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={deleteBudget}
                          disabled={deleting}
                          className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-md hover:bg-red-700 disabled:opacity-60"
                        >
                          {deleting ? "Deleting..." : "Confirm Delete"}
                        </button>
                        <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add budget modal */}
        {showAddBudget && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-ink">Add Budget</h2>
                <button onClick={() => setShowAddBudget(false)} className="text-ink-muted hover:text-ink text-xl">&times;</button>
              </div>
              {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
              <form onSubmit={addBudget} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Budget name <span className="text-stamp">*</span></label>
                  <input
                    className={inputCls}
                    value={budgetForm.name}
                    onChange={e => setBudgetForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="COE Budget"
                    required
                  />
                  <p className="text-xs text-ink-muted mt-1">e.g. COE Budget, Philanthropy, General</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Fiscal year <span className="text-stamp">*</span></label>
                  <input
                    className={inputCls}
                    value={budgetForm.fiscalYear}
                    onChange={e => setBudgetForm(f => ({ ...f, fiscalYear: e.target.value }))}
                    placeholder="FY2025"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Allocated amount <span className="text-stamp">*</span></label>
                  <input
                    className={inputCls}
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetForm.allocated}
                    onChange={e => setBudgetForm(f => ({ ...f, allocated: e.target.value }))}
                    placeholder="5000.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                  <textarea
                    className={inputCls}
                    rows={2}
                    value={budgetForm.notes}
                    onChange={e => setBudgetForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={saving} className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60">
                    {saving ? "Saving..." : "Add Budget"}
                  </button>
                  <button type="button" onClick={() => setShowAddBudget(false)} className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BudgetStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-paper rounded-lg p-4">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy";
