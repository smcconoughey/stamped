"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatCurrency } from "@/lib/utils";

const ALL_STATUSES = [
  "DRAFT","SUBMITTED","PENDING_APPROVAL","APPROVED","ORDERED",
  "PARTIALLY_RECEIVED","RECEIVED","READY_FOR_PICKUP","PICKED_UP","CANCELLED",
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT:              { label: "Draft",            cls: "bg-gray-100 text-gray-600" },
  SUBMITTED:          { label: "Submitted",        cls: "bg-blue-50 text-blue-700" },
  PENDING_APPROVAL:   { label: "Pending Approval", cls: "bg-yellow-50 text-yellow-700" },
  APPROVED:           { label: "Approved",         cls: "bg-green-50 text-green-700" },
  ORDERED:            { label: "Ordered",          cls: "bg-indigo-50 text-indigo-700" },
  PARTIALLY_RECEIVED: { label: "Partial",          cls: "bg-orange-50 text-orange-700" },
  RECEIVED:           { label: "Received",         cls: "bg-teal-50 text-teal-700" },
  READY_FOR_PICKUP:   { label: "Ready",            cls: "bg-purple-50 text-purple-700" },
  PICKED_UP:          { label: "Picked Up",        cls: "bg-gray-50 text-gray-500" },
  CANCELLED:          { label: "Cancelled",        cls: "bg-red-50 text-red-600" },
};

const STATUS_ORDER = ALL_STATUSES;

const BULK_STATUS_OPTIONS = ALL_STATUSES.map((s) => ({ label: `→ ${STATUS_META[s].label}`, value: s }));

type SortKey = "number" | "title" | "status" | "budget" | "org" | "amount" | "date";
type SortDir = "asc" | "desc";

function StatusPill({ status }: { status: string }) {
  const s = STATUS_META[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

// Inline status changer — clicking the pill opens a dropdown
function InlineStatus({
  requestId,
  status,
  canEdit,
  onChanged,
}: {
  requestId: string;
  status: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function pick(newStatus: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (newStatus === status) { setOpen(false); return; }
    setSaving(true);
    setOpen(false);
    await fetch(`/api/requests/${requestId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setSaving(false);
    onChanged();
  }

  if (!canEdit) return <StatusPill status={status} />;

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={saving}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-opacity ${STATUS_META[status]?.cls ?? "bg-gray-100 text-gray-600"} ${saving ? "opacity-50" : "hover:opacity-80"}`}
      >
        {saving ? "…" : STATUS_META[status]?.label ?? status}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={(e) => pick(s, e)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-paper flex items-center gap-2 ${s === status ? "font-semibold" : ""}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_META[s].cls.replace(/text-\S+/, "")}`} />
              {STATUS_META[s].label}
              {s === status && <span className="ml-auto text-ink-muted">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label, col, sort, dir, onSort,
}: {
  label: string; col: SortKey; sort: SortKey; dir: SortDir; onSort: (c: SortKey) => void;
}) {
  const active = sort === col;
  return (
    <th
      className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted cursor-pointer select-none hover:text-ink group"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>
          {active && dir === "asc" ? "↑" : "↓"}
        </span>
      </span>
    </th>
  );
}

export default function RequestsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  const isOrgLead = user?.role === "ORG_LEAD";
  const canEdit = isAdmin || isOrgLead;

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/requests?limit=500");
      const data = await res.json();
      setRequests(data.requests || []);
      setSelected(new Set());
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  function handleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("asc"); }
  }

  // Budget tabs
  const budgetMap = new Map<string, { id: string; name: string; fiscalYear: string }>();
  for (const r of requests) {
    if (r.budget) budgetMap.set(r.budget.id, r.budget);
  }
  const budgets = Array.from(budgetMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Tab filter
  const tabFiltered = requests.filter((r) => {
    if (activeTab === "cancelled") return r.status === "CANCELLED";
    if (activeTab === "all") return r.status !== "CANCELLED";
    return r.budget?.id === activeTab && r.status !== "CANCELLED";
  });

  // Search filter
  const searched = search
    ? tabFiltered.filter((r) =>
        r.number?.toLowerCase().includes(search.toLowerCase()) ||
        r.title?.toLowerCase().includes(search.toLowerCase()) ||
        r.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
        r.organization?.code?.toLowerCase().includes(search.toLowerCase())
      )
    : tabFiltered;

  // Sort
  function getValue(r: any, key: SortKey): string | number {
    switch (key) {
      case "number": return r.number ?? "";
      case "title":  return r.title ?? "";
      case "status": return STATUS_ORDER.indexOf(r.status);
      case "budget": return r.budget?.name ?? "";
      case "org":    return r.organization?.code ?? "";
      case "amount": return r.totalActual ?? r.totalEstimated ?? 0;
      case "date":   return new Date(r.updatedAt).getTime();
    }
  }
  const sorted = [...searched].sort((a, b) => {
    const av = getValue(a, sortKey);
    const bv = getValue(b, sortKey);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const cancelledCount = requests.filter((r) => r.status === "CANCELLED").length;
  const visibleIds = sorted.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(visibleIds));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selected.size === 0) return;
    setBulkLoading(true);
    try {
      await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), status: bulkStatus }),
      });
      await fetchRequests();
      setBulkStatus("");
    } finally { setBulkLoading(false); }
  }

  async function applyBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Permanently delete ${selected.size} request${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selected).map((id) => fetch(`/api/requests/${id}`, { method: "DELETE" })));
      await fetchRequests();
    } finally { setBulkLoading(false); }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Permanently delete this request?")) return;
    await fetch(`/api/requests/${id}`, { method: "DELETE" });
    await fetchRequests();
  }

  const sharedSortProps = { sort: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <div>
      <Header
        title={isAdmin ? "All Requests" : "My Requests"}
        subtitle={isAdmin ? "View and manage all purchase requests" : "Track purchase requests for your organization"}
        actions={<Link href="/requests/new" className="btn-stamp">New Request</Link>}
      />

      <div className="p-6 space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search number, title, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {/* Budget/Cost Center Tabs */}
        <div className="flex flex-wrap gap-0 border-b border-border">
          <TabBtn active={activeTab === "all"} onClick={() => { setActiveTab("all"); setSelected(new Set()); }}>
            All Active
            <span className="ml-1.5 text-xs opacity-60">{requests.filter((r) => r.status !== "CANCELLED").length}</span>
          </TabBtn>
          {budgets.map((b) => {
            const count = requests.filter((r) => r.budget?.id === b.id && r.status !== "CANCELLED").length;
            return (
              <TabBtn key={b.id} active={activeTab === b.id} onClick={() => { setActiveTab(b.id); setSelected(new Set()); }}>
                {b.name}
                <span className="ml-1.5 text-xs opacity-60">{count}</span>
              </TabBtn>
            );
          })}
          {cancelledCount > 0 && (
            <TabBtn active={activeTab === "cancelled"} onClick={() => { setActiveTab("cancelled"); setSelected(new Set()); }} danger>
              Cancelled
              <span className="ml-1.5 text-xs opacity-60">{cancelledCount}</span>
            </TabBtn>
          )}
        </div>

        {/* Bulk action bar */}
        {canEdit && selected.size > 0 && (
          <div className="flex items-center gap-3 bg-navy/5 border border-navy/20 rounded-lg px-4 py-2.5 flex-wrap">
            <span className="text-sm font-medium text-navy">{selected.size} selected</span>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="text-sm border border-border rounded-md px-3 py-1.5 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="">Change status…</option>
              {BULK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button onClick={applyBulkStatus} disabled={!bulkStatus || bulkLoading} size="sm">
              {bulkLoading ? "Applying…" : "Apply"}
            </Button>
            <button
              onClick={applyBulkDelete}
              disabled={bulkLoading}
              className="text-sm text-red-600 hover:text-red-700 font-medium border border-red-200 hover:border-red-300 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              Delete Selected
            </button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-ink-muted hover:text-ink ml-auto">
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 px-4 py-3">
                  {[80, 200, 120, 80, 80].map((w, j) => (
                    <div key={j} className="h-4 bg-paper rounded animate-pulse" style={{ width: w }} />
                  ))}
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">
              No requests found.{" "}
              <Link href="/requests/new" className="text-navy hover:underline">Submit a new request</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-paper/50">
                  <tr>
                    {canEdit && (
                      <th className="px-3 py-2.5 w-8">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-border" />
                      </th>
                    )}
                    <SortHeader label="Number" col="number" {...sharedSortProps} />
                    <SortHeader label="Title" col="title" {...sharedSortProps} />
                    <SortHeader label="Status" col="status" {...sharedSortProps} />
                    {budgets.length > 1 && <SortHeader label="Budget" col="budget" {...sharedSortProps} />}
                    {isAdmin && <SortHeader label="Org" col="org" {...sharedSortProps} />}
                    <SortHeader label="Amount" col="amount" {...sharedSortProps} />
                    <SortHeader label="Updated" col="date" {...sharedSortProps} />
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map((req) => {
                    const deletable = ["DRAFT", "SUBMITTED", "CANCELLED"].includes(req.status);
                    const canDel = isAdmin || (isOrgLead && deletable) || (req.submittedById === user?.id && deletable);
                    return (
                      <tr
                        key={req.id}
                        className={`hover:bg-paper/70 transition-colors cursor-pointer group ${selected.has(req.id) ? "bg-navy/[0.03]" : ""}`}
                        onClick={() => (window.location.href = `/requests/${req.id}`)}
                      >
                        {canEdit && (
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(req.id)} onChange={() => toggleOne(req.id)} className="rounded border-border" />
                          </td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            href={`/requests/${req.id}`}
                            className="font-mono text-xs text-navy hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {req.number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <span className="font-medium text-ink truncate block">{req.title}</span>
                          {req.vendorName && (
                            <span className="text-xs text-ink-muted truncate block">{req.vendorName}</span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <InlineStatus
                            requestId={req.id}
                            status={req.status}
                            canEdit={canEdit}
                            onChanged={fetchRequests}
                          />
                        </td>
                        {budgets.length > 1 && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-xs text-ink-secondary">{req.budget?.name ?? "—"}</span>
                          </td>
                        )}
                        {isAdmin && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-ink-secondary">{req.organization?.code}</span>
                            {req.organization?.costCenter && (
                              <span className="block text-xs text-ink-muted">CC: {req.organization.costCenter}</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="text-xs font-medium text-ink-secondary">
                            {req.totalActual
                              ? formatCurrency(req.totalActual)
                              : req.totalEstimated
                              ? formatCurrency(req.totalEstimated)
                              : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell whitespace-nowrap">
                          <span className="text-xs text-ink-muted">{formatDate(req.updatedAt)}</span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {canDel && (
                            <button
                              onClick={(e) => handleDelete(req.id, e)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted hover:text-red-600 p-1 rounded"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ children, active, onClick, danger }: {
  children: React.ReactNode; active: boolean; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? danger ? "border-red-500 text-red-600" : "border-navy text-navy"
          : "border-transparent text-ink-secondary hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
