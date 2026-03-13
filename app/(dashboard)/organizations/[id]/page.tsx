"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Header } from "@/components/layout/header";

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

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBudget, setActiveBudget] = useState<string | null>(null);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ name: "", fiscalYear: "", allocated: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetchOrg(); }, [id]);

  async function fetchOrg() {
    setLoading(true);
    const res = await fetch(`/api/organizations/${id}`);
    const data = await res.json();
    setOrg(data.org);
    if (data.org?.budgets?.length > 0 && !activeBudget) {
      setActiveBudget(data.org.budgets[0].id);
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
      }),
    });
    if (res.ok) {
      setShowAddBudget(false);
      setBudgetForm({ name: "", fiscalYear: "", allocated: "" });
      await fetchOrg();
    } else {
      const d = await res.json();
      setError(d.error || "Failed to create budget");
    }
    setSaving(false);
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
  const usedPct = selectedBudget
    ? Math.min(100, ((selectedBudget.spent + selectedBudget.reserved) / selectedBudget.allocated) * 100)
    : 0;

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
                <button
                  key={b.id}
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
              ))}
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
          ) : selectedBudget ? (
            <div className="p-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
              <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
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
                <p className="mt-4 text-sm text-ink-secondary">{selectedBudget.notes}</p>
              )}
            </div>
          ) : null}
        </div>

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
