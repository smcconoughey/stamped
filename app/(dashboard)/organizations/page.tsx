"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

type OrgRow = {
  id: string; name: string; code: string; department: string | null; costCenter: string | null;
  budgetCount: number; memberCount: number; requestCount: number;
  totalAllocated: number; totalSpent: number; totalReserved: number; totalAvailable: number;
};

type Settings = { currentFiscalYear: string | null; fyEndDate: string | null };

type SortKey = "name" | "allocated" | "spent" | "available" | "pct" | "requests" | "members";
type SortDir = "asc" | "desc";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyLevel(spentPct: number, daysLeft: number | null): "ok" | "warn" | "danger" | "overdue" {
  if (daysLeft !== null && daysLeft < 0) return "overdue";
  if (daysLeft !== null && daysLeft < 45) {
    if (spentPct < 50) return "danger";  // less than half spent, FY ending soon
    if (spentPct < 75) return "warn";
  }
  if (daysLeft !== null && daysLeft < 90 && spentPct < 30) return "warn";
  if (spentPct > 95) return "warn";
  return "ok";
}

function SpendBar({ pct, daysLeft }: { pct: number; daysLeft: number | null }) {
  const level = urgencyLevel(pct, daysLeft);
  const color = level === "danger" ? "bg-red-500" : level === "warn" ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs font-semibold w-9 text-right ${
        level === "danger" ? "text-red-600" : level === "warn" ? "text-amber-600" : "text-emerald-700"
      }`}>{Math.round(pct)}%</span>
    </div>
  );
}

export default function OrganizationsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [fiscalYears, setFiscalYears] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>({ currentFiscalYear: null, fyEndDate: null });
  const [activeFY, setActiveFY] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editFY, setEditFY] = useState(false);
  const [fyForm, setFyForm] = useState({ currentFiscalYear: "", fyEndDate: "" });
  const [savingFY, setSavingFY] = useState(false);

  useEffect(() => { fetchOrgs(); }, []);
  useEffect(() => { if (activeFY) fetchOrgs(activeFY); }, [activeFY]);

  async function fetchOrgs(fy?: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations${fy ? `?fy=${fy}` : ""}`);
      const data = await res.json();
      setOrgs(data.organizations ?? []);
      setFiscalYears(data.fiscalYears ?? []);
      setSettings(data.settings ?? {});
      if (!activeFY && data.settings?.currentFiscalYear) {
        setActiveFY(data.settings.currentFiscalYear);
      }
    } finally { setLoading(false); }
  }

  async function saveFYSettings() {
    setSavingFY(true);
    try {
      await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fyForm),
      });
      setEditFY(false);
      fetchOrgs(fyForm.currentFiscalYear || activeFY);
    } finally { setSavingFY(false); }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  const daysLeft = daysUntil(settings.fyEndDate);

  // Aggregate stats
  const totals = useMemo(() => {
    const allocated = orgs.reduce((s, o) => s + o.totalAllocated, 0);
    const spent = orgs.reduce((s, o) => s + o.totalSpent, 0);
    const reserved = orgs.reduce((s, o) => s + o.totalReserved, 0);
    const available = orgs.reduce((s, o) => s + o.totalAvailable, 0);
    const pct = allocated > 0 ? ((spent + reserved) / allocated) * 100 : 0;
    return { allocated, spent, reserved, available, pct };
  }, [orgs]);

  const overallUrgency = urgencyLevel(totals.pct, daysLeft);

  const sorted = useMemo(() => {
    const v = (o: OrgRow): number | string => {
      switch (sortKey) {
        case "name":      return o.name;
        case "allocated": return o.totalAllocated;
        case "spent":     return o.totalSpent;
        case "available": return o.totalAvailable;
        case "pct":       return o.totalAllocated > 0 ? (o.totalSpent + o.totalReserved) / o.totalAllocated : 0;
        case "requests":  return o.requestCount;
        case "members":   return o.memberCount;
      }
    };
    return [...orgs].sort((a, b) => {
      const av = v(a), bv = v(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [orgs, sortKey, sortDir]);

  function SortTh({ label, col, right }: { label: string; col: SortKey; right?: boolean }) {
    const active = sortKey === col;
    return (
      <th onClick={() => handleSort(col)}
        className={`px-4 py-2.5 text-2xs font-semibold tracking-widest uppercase text-ink-muted cursor-pointer select-none hover:text-ink whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
        <span className="inline-flex items-center gap-1 justify-end">
          {label}
          <span className={`transition-opacity ${active ? "opacity-100" : "opacity-0 hover:opacity-40"}`}>{active && sortDir === "asc" ? "↑" : "↓"}</span>
        </span>
      </th>
    );
  }

  return (
    <div>
      <Header title="Organizations" subtitle={`Budget health across all organizations ${activeFY ? `· ${activeFY}` : ""}`} />

      <div className="p-6 space-y-6">

        {/* FY selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Fiscal Year:</span>
          {fiscalYears.map(fy => (
            <button key={fy} onClick={() => setActiveFY(fy)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                activeFY === fy ? "bg-navy text-white border-navy" : "bg-white text-ink-secondary border-border hover:border-navy/40 hover:text-ink"
              }`}>
              {fy}
            </button>
          ))}
          <button onClick={() => setActiveFY("")}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              !activeFY ? "bg-navy text-white border-navy" : "bg-white text-ink-secondary border-border hover:border-navy/40"
            }`}>
            All
          </button>
          {isSuperAdmin && (
            <button onClick={() => { setEditFY(true); setFyForm({ currentFiscalYear: settings.currentFiscalYear ?? "", fyEndDate: settings.fyEndDate ?? "" }); }}
              className="ml-2 text-xs text-ink-muted hover:text-ink underline">
              Edit FY settings
            </button>
          )}
          {settings.fyEndDate && (
            <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${
              daysLeft !== null && daysLeft < 0 ? "bg-red-50 text-red-700 border-red-200"
              : daysLeft !== null && daysLeft < 45 ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-paper text-ink-secondary border-border"
            }`}>
              {daysLeft !== null && daysLeft < 0
                ? `FY ended ${Math.abs(daysLeft)}d ago`
                : `${daysLeft}d left in ${settings.currentFiscalYear ?? "FY"}`}
            </span>
          )}
        </div>

        {/* Summary cards */}
        {!loading && orgs.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Organizations" value={String(orgs.length)} sub={`${orgs.filter(o => o.budgetCount > 0).length} with budgets`} />
            <StatCard label="Total Allocated" value={formatCurrency(totals.allocated)} sub={`across ${orgs.reduce((s,o) => s + o.budgetCount, 0)} budgets`} />
            <StatCard label="Spent" value={formatCurrency(totals.spent)} sub={`${Math.round((totals.spent / totals.allocated) * 100)}% of allocated`}
              color={overallUrgency === "danger" ? "text-red-600" : overallUrgency === "warn" ? "text-amber-600" : "text-emerald-700"} />
            <StatCard label="Pending" value={formatCurrency(totals.reserved)} sub="committed, not yet received" color="text-indigo-600" />
            <StatCard label="Available" value={formatCurrency(totals.available)}
              sub={overallUrgency === "danger" && daysLeft !== null
                ? `⚠ Only ${daysLeft}d left in FY!`
                : overallUrgency === "warn"
                ? "Monitor spending pace"
                : "Remaining budget"}
              color={overallUrgency === "danger" ? "text-red-600" : overallUrgency === "warn" ? "text-amber-600" : "text-green-700"} />
          </div>
        )}

        {/* Urgency banner */}
        {!loading && overallUrgency !== "ok" && daysLeft !== null && totals.allocated > 0 && (
          <div className={`rounded-lg border px-5 py-4 flex items-start gap-3 ${
            overallUrgency === "danger"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}>
            <span className="text-xl">{overallUrgency === "danger" ? "🚨" : "⚠️"}</span>
            <div>
              <p className="font-semibold text-sm">
                {overallUrgency === "danger"
                  ? `Only ${Math.round(totals.pct)}% of budget committed with ${daysLeft} days left in the fiscal year`
                  : `${Math.round(totals.pct)}% committed — monitor pace with ${daysLeft} days remaining`}
              </p>
              <p className="text-xs mt-0.5 opacity-80">
                {overallUrgency === "danger"
                  ? `${formatCurrency(totals.available)} is at risk of being returned. Orgs should accelerate spending or submit pending orders.`
                  : "Some organizations may need to pick up their pace to avoid returning funds."}
              </p>
            </div>
          </div>
        )}

        {/* Overall progress bar */}
        {!loading && totals.allocated > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Overall Budget Utilization</span>
              <span className="text-xs text-ink-muted">
                {formatCurrency(totals.spent + totals.reserved)} of {formatCurrency(totals.allocated)}
              </span>
            </div>
            <div className="w-full h-3 bg-border rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all duration-700"
                style={{ width: `${Math.min(100, (totals.spent / totals.allocated) * 100)}%` }} />
              <div className="h-full bg-indigo-400 transition-all duration-700"
                style={{ width: `${Math.min(100 - (totals.spent / totals.allocated) * 100, (totals.reserved / totals.allocated) * 100)}%` }} />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Spent</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />Pending</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-border inline-block" />Available</span>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="divide-y divide-border p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-5 bg-paper rounded animate-pulse" />)}
              </div>
            ) : orgs.length === 0 ? (
              <div className="py-12 text-center text-sm text-ink-muted">No organizations found{activeFY ? ` for ${activeFY}` : ""}.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-paper/50">
                  <tr>
                    <SortTh label="Organization" col="name" />
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Budgets</th>
                    <SortTh label="Allocated" col="allocated" right />
                    <SortTh label="Spent" col="spent" right />
                    <SortTh label="Pending" col="available" right />
                    <SortTh label="Available" col="available" right />
                    <SortTh label="Usage" col="pct" right />
                    <SortTh label="Requests" col="requests" right />
                    <SortTh label="Members" col="members" right />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map(org => {
                    const pct = org.totalAllocated > 0 ? ((org.totalSpent + org.totalReserved) / org.totalAllocated) * 100 : 0;
                    const level = urgencyLevel(pct, daysLeft);
                    return (
                      <tr key={org.id} className="hover:bg-paper/60 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/organizations/${org.id}`} className="font-medium text-ink hover:text-navy">{org.name}</Link>
                          <p className="text-xs text-ink-muted">{org.code}{org.department ? ` · ${org.department}` : ""}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-ink-secondary">{org.budgetCount} {org.budgetCount === 1 ? "budget" : "budgets"}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium text-ink">{org.totalAllocated > 0 ? formatCurrency(org.totalAllocated) : "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-ink-secondary">{org.totalSpent > 0 ? formatCurrency(org.totalSpent) : "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-indigo-600">{org.totalReserved > 0 ? formatCurrency(org.totalReserved) : "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${
                            org.totalAvailable < 0 ? "text-red-600" : org.totalAvailable < 200 ? "text-amber-700" : "text-green-700"
                          }`}>
                            {org.totalAllocated > 0 ? formatCurrency(org.totalAvailable) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          {org.totalAllocated > 0
                            ? <SpendBar pct={pct} daysLeft={daysLeft} />
                            : <span className="text-xs text-ink-muted">no budget</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm text-ink-secondary">{org.requestCount}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm text-ink-secondary">{org.memberCount}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Footer totals */}
                {sorted.length > 1 && (
                  <tfoot className="border-t-2 border-border bg-paper/80">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-ink-muted" colSpan={2}>Totals ({sorted.length} orgs)</td>
                      <td className="px-4 py-3 text-right font-bold text-ink">{formatCurrency(totals.allocated)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink-secondary">{formatCurrency(totals.spent)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-600">{formatCurrency(totals.reserved)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(totals.available)}</td>
                      <td className="px-4 py-3"><SpendBar pct={totals.pct} daysLeft={daysLeft} /></td>
                      <td className="px-4 py-3 text-right font-semibold text-ink-secondary">{orgs.reduce((s,o) => s + o.requestCount, 0)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink-secondary">{orgs.reduce((s,o) => s + o.memberCount, 0)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      </div>

      {/* FY settings modal */}
      {editFY && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-ink">FY Settings</h2>
              <button onClick={() => setEditFY(false)} className="text-ink-muted hover:text-ink text-xl">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Current fiscal year</label>
                <input className={inputCls} value={fyForm.currentFiscalYear}
                  onChange={e => setFyForm(f => ({ ...f, currentFiscalYear: e.target.value }))}
                  placeholder="FY2026" />
                <p className="text-xs text-ink-muted mt-1">e.g. FY2026 — must match budget fiscal year values</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">FY end date</label>
                <input className={inputCls} type="date" value={fyForm.fyEndDate}
                  onChange={e => setFyForm(f => ({ ...f, fyEndDate: e.target.value }))} />
                <p className="text-xs text-ink-muted mt-1">Controls urgency indicators across the dashboard</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveFYSettings} disabled={savingFY}
                  className="flex-1 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60">
                  {savingFY ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setEditFY(false)} className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? "text-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-0.5">{sub}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy";
