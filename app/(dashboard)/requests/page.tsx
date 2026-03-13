"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { StatusBadge } from "@/components/requests/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDate,
  formatCurrency,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  RequestStatus,
} from "@/lib/utils";

// Active statuses shown at top; terminal statuses collapsible
const ACTIVE_STATUSES = new Set(["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "READY_FOR_PICKUP"]);
const TERMINAL_STATUSES = new Set(["RECEIVED", "PICKED_UP", "CANCELLED"]);

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Active", value: "_active" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Ordered", value: "ORDERED" },
  { label: "Received", value: "RECEIVED" },
  { label: "Picked Up", value: "PICKED_UP" },
  { label: "Cancelled", value: "CANCELLED" },
];

const BULK_STATUS_OPTIONS = [
  { label: "Mark Submitted", value: "SUBMITTED" },
  { label: "Mark Approved", value: "APPROVED" },
  { label: "Mark Ordered", value: "ORDERED" },
  { label: "Mark Received", value: "RECEIVED" },
  { label: "Mark Picked Up", value: "PICKED_UP" },
  { label: "Mark Cancelled", value: "CANCELLED" },
];

export default function RequestsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  const isOrgLead = user?.role === "ORG_LEAD";
  const canBulkEdit = isAdmin || isOrgLead;

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("_active");
  const [orgFilter, setOrgFilter] = useState("");
  const [budgetFilter, setBudgetFilter] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeStatus && activeStatus !== "_active") params.set("status", activeStatus);
      if (search) params.set("search", search);
      if (orgFilter) params.set("orgId", orgFilter);
      params.set("limit", "200");
      const res = await fetch(`/api/requests?${params}`);
      const data = await res.json();
      setRequests(data.requests || []);
      setSelected(new Set());
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [activeStatus, orgFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchRequests();
  }

  // Filter locally for _active tab and budget
  const filtered = requests.filter((r) => {
    if (activeStatus === "_active" && !ACTIVE_STATUSES.has(r.status)) return false;
    if (budgetFilter && r.budget?.id !== budgetFilter) return false;
    return true;
  });

  const activeRows = filtered.filter((r) => ACTIVE_STATUSES.has(r.status));
  const completedRows = filtered.filter((r) => TERMINAL_STATUSES.has(r.status));

  // Derive unique orgs and budgets for filter dropdowns
  const allOrgs = Array.from(new Map(requests.map((r) => [r.organization?.id, r.organization])).values()).filter(Boolean);
  const allBudgets = Array.from(new Map(requests.filter((r) => r.budget).map((r) => [r.budget.id, r.budget])).values());

  // Selection helpers
  const visibleIds = filtered.map((r) => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
    } finally {
      setBulkLoading(false);
    }
  }

  const showGrouped = activeStatus === "" || activeStatus === "_active";

  return (
    <div>
      <Header
        title={isAdmin ? "All Requests" : "My Requests"}
        subtitle={isAdmin ? "View and manage all purchase requests" : "Track purchase requests for your organization"}
        actions={
          <Link href="/requests/new" className="btn-stamp">
            New Request
          </Link>
        }
      />

      <div className="p-6 space-y-4">
        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
            <Input
              placeholder="Search by number, title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" variant="secondary" size="md">
              Search
            </Button>
          </form>

          {/* Org filter — admin only */}
          {isAdmin && allOrgs.length > 1 && (
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="text-sm border border-border rounded-md px-3 py-1.5 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="">All Orgs</option>
              {allOrgs.map((o: any) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}

          {/* Budget filter */}
          {allBudgets.length > 1 && (
            <select
              value={budgetFilter}
              onChange={(e) => setBudgetFilter(e.target.value)}
              className="text-sm border border-border rounded-md px-3 py-1.5 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value="">All Budgets</option>
              {allBudgets.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name} ({b.fiscalYear})</option>
              ))}
            </select>
          )}
        </div>

        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setActiveStatus(tab.value); setSelected(new Set()); }}
              className={`px-3 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                activeStatus === tab.value
                  ? "border-navy text-navy"
                  : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bulk action bar */}
        {canBulkEdit && someSelected && (
          <div className="flex items-center gap-3 bg-navy/5 border border-navy/20 rounded-lg px-4 py-2.5">
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
            <Button
              onClick={applyBulkStatus}
              disabled={!bulkStatus || bulkLoading}
              size="sm"
            >
              {bulkLoading ? "Applying…" : "Apply"}
            </Button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm text-ink-muted hover:text-ink ml-auto"
            >
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-paper rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-12 text-ink-muted">
            No requests found.{" "}
            <Link href="/requests/new" className="text-navy hover:underline">
              Submit a new request
            </Link>
          </div>
        ) : showGrouped ? (
          <>
            {/* Active group */}
            {activeRows.length > 0 && (
              <RequestTable
                rows={activeRows}
                isAdmin={isAdmin}
                canBulkEdit={canBulkEdit}
                selected={selected}
                onToggleAll={() => {
                  const ids = activeRows.map((r) => r.id);
                  const allSel = ids.every((id) => selected.has(id));
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (allSel) ids.forEach((id) => next.delete(id));
                    else ids.forEach((id) => next.add(id));
                    return next;
                  });
                }}
                onToggleOne={toggleOne}
                sectionLabel={activeStatus === "_active" ? "Active" : undefined}
              />
            )}

            {/* Completed group — collapsible when showing "All" or "Active" */}
            {completedRows.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCompleted((v) => !v)}
                  className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink mb-2 font-medium"
                >
                  <svg className={`w-4 h-4 transition-transform ${showCompleted ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Completed / Closed ({completedRows.length})
                </button>
                {showCompleted && (
                  <RequestTable
                    rows={completedRows}
                    isAdmin={isAdmin}
                    canBulkEdit={canBulkEdit}
                    selected={selected}
                    onToggleAll={() => {
                      const ids = completedRows.map((r) => r.id);
                      const allSel = ids.every((id) => selected.has(id));
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (allSel) ids.forEach((id) => next.delete(id));
                        else ids.forEach((id) => next.add(id));
                        return next;
                      });
                    }}
                    onToggleOne={toggleOne}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <RequestTable
            rows={filtered}
            isAdmin={isAdmin}
            canBulkEdit={canBulkEdit}
            selected={selected}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
          />
        )}
      </div>
    </div>
  );
}

function RequestTable({
  rows,
  isAdmin,
  canBulkEdit,
  selected,
  onToggleAll,
  onToggleOne,
  sectionLabel,
}: {
  rows: any[];
  isAdmin: boolean;
  canBulkEdit: boolean;
  selected: Set<string>;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  sectionLabel?: string;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="card p-0 overflow-hidden">
      {sectionLabel && (
        <div className="px-4 py-2 border-b border-border bg-paper/50">
          <span className="text-xs font-semibold tracking-widest uppercase text-ink-muted">{sectionLabel}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-paper/50">
            <tr>
              {canBulkEdit && (
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    className="rounded border-border"
                  />
                </th>
              )}
              <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                Number
              </th>
              <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                Title
              </th>
              <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">
                Org
              </th>
              <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">
                Budget
              </th>
              <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                Status
              </th>
              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">
                Amount
              </th>
              <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((req) => (
              <tr
                key={req.id}
                className={`hover:bg-paper transition-colors cursor-pointer ${selected.has(req.id) ? "bg-navy/3" : ""}`}
                onClick={() => (window.location.href = `/requests/${req.id}`)}
              >
                {canBulkEdit && (
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(req.id)}
                      onChange={() => onToggleOne(req.id)}
                      className="rounded border-border"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
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
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className="text-xs font-medium text-ink-secondary">{req.organization?.code}</span>
                  {req.organization?.costCenter && (
                    <span className="text-xs text-ink-muted block">CC: {req.organization.costCenter}</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {req.budget ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {req.budget.name}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={req.status as RequestStatus} size="sm" />
                </td>
                <td className="px-4 py-3 text-right hidden lg:table-cell">
                  <span className="text-xs text-ink-secondary font-medium">
                    {req.totalActual
                      ? formatCurrency(req.totalActual)
                      : req.totalEstimated
                      ? <span className="text-ink-muted">{formatCurrency(req.totalEstimated)}</span>
                      : <span className="text-ink-muted">—</span>
                    }
                  </span>
                </td>
                <td className="px-4 py-3 text-right hidden md:table-cell">
                  <span className="text-xs text-ink-muted">{formatDate(req.createdAt)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
