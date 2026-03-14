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

type BudgetOption = { id: string; name: string; fiscalYear: string; orgCode: string; label: string };
type SortKey = "number" | "title" | "status" | "budget" | "org" | "amount" | "date";
type SortDir = "asc" | "desc";

function useClickOutside(cb: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) cb(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [cb]);
  return ref;
}

function InlineStatus({ requestId, status, canEdit, onChanged }: { requestId: string; status: string; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  async function pick(s: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (s === status) { setOpen(false); return; }
    setSaving(true); setOpen(false);
    await fetch(`/api/requests/${requestId}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
    setSaving(false); onChanged();
  }

  const meta = STATUS_META[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  if (!canEdit) return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${meta.cls}`}>{meta.label}</span>;

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }} disabled={saving}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${meta.cls} ${saving ? "opacity-50" : "hover:opacity-80"}`}>
        {saving ? "…" : meta.label}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={(e) => pick(s, e)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-paper flex items-center gap-2 ${s === status ? "font-semibold" : ""}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_META[s].cls.split(" ").find(c => c.startsWith("bg-"))}`} />
              {STATUS_META[s].label}
              {s === status && <span className="ml-auto text-ink-muted">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineBudget({ requestId, budget, budgets, canEdit, onChanged }: {
  requestId: string; budget: { id: string; name: string } | null; budgets: BudgetOption[]; canEdit: boolean; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  async function pick(budgetId: string | null, e: React.MouseEvent) {
    e.stopPropagation();
    if (budgetId === (budget?.id ?? null)) { setOpen(false); return; }
    setSaving(true); setOpen(false);
    await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [requestId], budgetId: budgetId ?? "" }) });
    setSaving(false); onChanged();
  }

  if (!canEdit) return <span className="text-xs text-ink-secondary">{budget?.name ?? <span className="text-ink-muted">—</span>}</span>;

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }} disabled={saving}
        className={`inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 border transition-colors ${saving ? "opacity-50" : "hover:bg-paper"} ${budget ? "border-blue-200 bg-blue-50 text-blue-700" : "border-dashed border-border text-ink-muted"}`}>
        {saving ? "…" : budget?.name ?? "Assign budget"}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[200px] max-h-60 overflow-y-auto">
          <button onClick={(e) => pick(null, e)} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-paper text-ink-muted ${!budget ? "font-semibold" : ""}`}>
            — No budget
          </button>
          {budgets.map(b => (
            <button key={b.id} onClick={(e) => pick(b.id, e)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-paper flex items-center justify-between gap-2 ${b.id === budget?.id ? "font-semibold text-navy" : "text-ink"}`}>
              <span>{b.name}</span>
              <span className="text-ink-muted shrink-0">{b.fiscalYear}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortHeader({ label, col, sort, dir, onSort }: { label: string; col: SortKey; sort: SortKey; dir: SortDir; onSort: (c: SortKey) => void }) {
  const active = sort === col;
  return (
    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted cursor-pointer select-none hover:text-ink group whitespace-nowrap" onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>{active && dir === "asc" ? "↑" : "↓"}</span>
      </span>
    </th>
  );
}

export default function RequestsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  const isOrgLead = user?.role === "ORG_LEAD";
  const isStudent = !isAdmin && !isOrgLead;
  const canEdit = isAdmin || isOrgLead;

  const [requests, setRequests] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableOrgs, setAvailableOrgs] = useState<{ id: string; name: string; code: string }[]>([]);
  const [pendingOrgs, setPendingOrgs] = useState<{ id: string; name: string; code: string }[]>([]);
  const [joiningOrg, setJoiningOrg] = useState<string | null>(null);
  const [joinMsg, setJoinMsg] = useState<{ orgId: string; text: string; ok: boolean } | null>(null);
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [search, setSearch] = useState("");
  const [activeOrg, setActiveOrg] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkBudgetId, setBulkBudgetId] = useState("");
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
    } catch { setRequests([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/budgets").then(r => r.json()).then(d => setBudgets(d.budgets || []));
  }, [canEdit]);

  // For students: fetch orgs they could join (all orgs in tenant)
  useEffect(() => {
    if (!isStudent) return;
    fetch("/api/organizations/available").then(r => r.ok ? r.json() : { orgs: [] }).then(d => {
      setAvailableOrgs((d.orgs ?? []).filter((o: any) => !o.membership));
      setPendingOrgs((d.orgs ?? []).filter((o: any) => o.membership?.status === "PENDING"));
    });
  }, [isStudent]);

  function handleSort(col: SortKey) {
    if (sortKey === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("asc"); }
  }

  // Derive unique orgs from loaded requests (for student multi-org switcher)
  const orgMap = new Map<string, { id: string; name: string; code: string }>();
  for (const r of requests) {
    if (r.organization) orgMap.set(r.organization.id, r.organization);
  }
  const orgList = Array.from(orgMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const showOrgSwitcher = isStudent && orgList.length > 1;

  // Filter by selected org first (students with multiple orgs)
  const orgFiltered = (showOrgSwitcher && activeOrg !== "all")
    ? requests.filter(r => r.organization?.id === activeOrg)
    : requests;

  // Budget tabs derived from org-filtered requests
  const budgetMap = new Map<string, { id: string; name: string; fiscalYear: string }>();
  for (const r of orgFiltered) { if (r.budget) budgetMap.set(r.budget.id, r.budget); }
  const budgetTabs = Array.from(budgetMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const tabFiltered = orgFiltered.filter(r => {
    if (activeTab === "cancelled") return r.status === "CANCELLED";
    if (activeTab === "all") return r.status !== "CANCELLED";
    return r.budget?.id === activeTab && r.status !== "CANCELLED";
  });

  const searched = search ? tabFiltered.filter(r =>
    r.number?.toLowerCase().includes(search.toLowerCase()) ||
    r.title?.toLowerCase().includes(search.toLowerCase()) ||
    r.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
    r.budget?.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.submittedBy?.name?.toLowerCase().includes(search.toLowerCase())
  ) : tabFiltered;

  const STATUS_ORDER_MAP: Record<string, number> = Object.fromEntries(ALL_STATUSES.map((s, i) => [s, i]));
  function getValue(r: any, key: SortKey): string | number {
    switch (key) {
      case "number": return r.number ?? "";
      case "title":  return r.title ?? "";
      case "status": return STATUS_ORDER_MAP[r.status] ?? 99;
      case "budget": return r.budget?.name ?? "";
      case "org":    return r.organization?.code ?? "";
      case "amount": return r.totalActual ?? r.totalEstimated ?? 0;
      case "date":   return new Date(r.updatedAt).getTime();
    }
  }
  const sorted = [...searched].sort((a, b) => {
    const av = getValue(a, sortKey), bv = getValue(b, sortKey);
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const cancelledCount = orgFiltered.filter(r => r.status === "CANCELLED").length;
  const visibleIds = sorted.map(r => r.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  function toggleAll() { if (allSelected) setSelected(new Set()); else setSelected(new Set(visibleIds)); }
  function toggleOne(id: string) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function applyBulkStatus() {
    if (!bulkStatus || !selected.size) return;
    setBulkLoading(true);
    try {
      await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected), status: bulkStatus }) });
      await fetchRequests(); setBulkStatus("");
    } finally { setBulkLoading(false); }
  }

  async function applyBulkBudget() {
    if (bulkBudgetId === "" && !confirm("Remove budget assignment from selected requests?")) return;
    setBulkLoading(true);
    try {
      await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected), budgetId: bulkBudgetId }) });
      await fetchRequests(); setBulkBudgetId("");
    } finally { setBulkLoading(false); }
  }

  async function applyBulkDelete() {
    if (!selected.size || !confirm(`Permanently delete ${selected.size} request${selected.size === 1 ? "" : "s"}?`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selected).map(id => fetch(`/api/requests/${id}`, { method: "DELETE" })));
      await fetchRequests();
    } finally { setBulkLoading(false); }
  }

  async function joinOrg(orgId: string) {
    setJoiningOrg(orgId);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setJoinMsg({ orgId, text: data.isOwner ? "You're now the president of this org!" : "Request sent — waiting for approval.", ok: true });
        fetchRequests();
      } else {
        setJoinMsg({ orgId, text: data.error || "Failed to join", ok: false });
      }
    } finally { setJoiningOrg(null); }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Permanently delete this request?")) return;
    await fetch(`/api/requests/${id}`, { method: "DELETE" });
    await fetchRequests();
  }

  // Active org label for header subtitle
  const activeOrgObj = orgList.find(o => o.id === activeOrg);
  const pageTitle = isAdmin ? "All Requests" : isOrgLead ? "Requests" : (orgList.length === 1 ? orgList[0].name : activeOrgObj?.name ?? "My Organizations");
  const pageSubtitle = isAdmin
    ? "View and manage all purchase requests"
    : isOrgLead
    ? "View and manage your organization's requests"
    : orgList.length === 1
    ? `${orgList[0].code} · ${orgFiltered.filter(r => r.status !== "CANCELLED").length} active requests`
    : "All purchase requests across your organizations";

  const sharedSort = { sort: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <div>
      <Header
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={<Link href="/requests/new" className="btn-stamp">New Request</Link>}
      />

      <div className="p-6 space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Search number, title, vendor, submitter..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        </div>

        {/* Pending approvals notice */}
        {isStudent && pendingOrgs.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Awaiting approval to join: <strong>{pendingOrgs.map(o => o.name).join(", ")}</strong>
          </div>
        )}

        {/* Join org panel — shown to students with no approved orgs, or when toggled */}
        {isStudent && !loading && (orgList.length === 0 || showJoinPanel) && availableOrgs.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-ink">{orgList.length === 0 ? "Join an Organization" : "Join Another Organization"}</p>
              {orgList.length > 0 && <button onClick={() => setShowJoinPanel(false)} className="text-xs text-ink-muted hover:text-ink">&times; Close</button>}
            </div>
            <p className="text-xs text-ink-muted mb-3">
              {orgList.length === 0
                ? "You're not a member of any organization yet. Request to join one below — the org president will approve you."
                : "Request to join an additional organization."}
            </p>
            <div className="divide-y divide-border">
              {availableOrgs.map(org => (
                <div key={org.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium text-ink">{org.name}</span>
                    <span className="ml-2 font-mono text-xs text-ink-muted">{org.code}</span>
                  </div>
                  {joinMsg?.orgId === org.id ? (
                    <span className={`text-xs font-medium ${joinMsg.ok ? "text-green-700" : "text-red-600"}`}>{joinMsg.text}</span>
                  ) : (
                    <button
                      onClick={() => joinOrg(org.id)}
                      disabled={joiningOrg === org.id}
                      className="px-3 py-1 text-xs font-semibold bg-navy text-white rounded hover:bg-navy-light disabled:opacity-60"
                    >
                      {joiningOrg === org.id ? "Requesting..." : "Request to Join"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Org switcher — only shown for students in multiple orgs */}
        {isStudent && orgList.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {showOrgSwitcher && (
              <>
                <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">Org:</span>
                {[{ id: "all", name: "All", code: "" }, ...orgList].map(org => (
                  <button
                    key={org.id}
                    onClick={() => { setActiveOrg(org.id); setActiveTab("all"); setSelected(new Set()); }}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      activeOrg === org.id
                        ? "bg-navy text-white border-navy"
                        : "bg-white text-ink-secondary border-border hover:border-navy/40 hover:text-ink"
                    }`}
                  >
                    {org.id === "all" ? "All" : org.code || org.name}
                  </button>
                ))}
              </>
            )}
            {availableOrgs.length > 0 && !showJoinPanel && (
              <button
                onClick={() => setShowJoinPanel(true)}
                className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-navy/40 text-navy hover:bg-navy/5 transition-colors"
              >
                + Join org
              </button>
            )}
          </div>
        )}

        {/* Budget/Cost Center Tabs */}
        <div className="flex flex-wrap gap-0 border-b border-border">
          <TabBtn active={activeTab === "all"} onClick={() => { setActiveTab("all"); setSelected(new Set()); }}>
            All Active <span className="ml-1.5 text-xs opacity-60">{orgFiltered.filter(r => r.status !== "CANCELLED").length}</span>
          </TabBtn>
          {budgetTabs.map(b => {
            const count = orgFiltered.filter(r => r.budget?.id === b.id && r.status !== "CANCELLED").length;
            return (
              <TabBtn key={b.id} active={activeTab === b.id} onClick={() => { setActiveTab(b.id); setSelected(new Set()); }}>
                {b.name} <span className="ml-1.5 text-xs opacity-60">{count}</span>
              </TabBtn>
            );
          })}
          {cancelledCount > 0 && (
            <TabBtn active={activeTab === "cancelled"} onClick={() => { setActiveTab("cancelled"); setSelected(new Set()); }} danger>
              Cancelled <span className="ml-1.5 text-xs opacity-60">{cancelledCount}</span>
            </TabBtn>
          )}
        </div>

        {/* Bulk action bar */}
        {(canEdit || isStudent) && selected.size > 0 && (
          <div className="flex items-center gap-3 bg-navy/5 border border-navy/20 rounded-lg px-4 py-2.5 flex-wrap">
            <span className="text-sm font-medium text-navy">{selected.size} selected</span>

            {canEdit && (
              <>
                {/* Status change */}
                <div className="flex items-center gap-2 border-r border-navy/20 pr-3">
                  <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
                    className="text-sm border border-border rounded-md px-2 py-1.5 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-navy">
                    <option value="">Status…</option>
                    {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                  <Button onClick={applyBulkStatus} disabled={!bulkStatus || bulkLoading} size="sm">Apply</Button>
                </div>

                {/* Budget assign */}
                {budgets.length > 0 && (
                  <div className="flex items-center gap-2 border-r border-navy/20 pr-3">
                    <select value={bulkBudgetId} onChange={e => setBulkBudgetId(e.target.value)}
                      className="text-sm border border-border rounded-md px-2 py-1.5 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-navy">
                      <option value="">Assign budget…</option>
                      <option value="">— Remove budget</option>
                      {budgets.map(b => <option key={b.id} value={b.id}>{b.orgCode} — {b.name} ({b.fiscalYear})</option>)}
                    </select>
                    <Button onClick={applyBulkBudget} disabled={bulkLoading} size="sm">Assign</Button>
                  </div>
                )}
              </>
            )}

            <button onClick={applyBulkDelete} disabled={bulkLoading}
              className="text-sm text-red-600 hover:text-red-700 font-medium border border-red-200 hover:border-red-300 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50">
              Delete Selected
            </button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-ink-muted hover:text-ink ml-auto">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4 px-4 py-3">
                  {[80, 200, 120, 140, 80, 80].map((w, j) => <div key={j} className="h-4 bg-paper rounded animate-pulse" style={{ width: w }} />)}
                </div>
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-ink-muted">
              No requests found. <Link href="/requests/new" className="text-navy hover:underline">Submit one</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-paper/50">
                  <tr>
                    {(canEdit || isStudent) && <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-border" /></th>}
                    <SortHeader label="Number" col="number" {...sharedSort} />
                    <SortHeader label="Item" col="title" {...sharedSort} />
                    <SortHeader label="Status" col="status" {...sharedSort} />
                    <SortHeader label="Budget" col="budget" {...sharedSort} />
                    {(isAdmin || (isStudent && orgList.length > 1)) && <SortHeader label="Org" col="org" {...sharedSort} />}
                    <SortHeader label="Amount" col="amount" {...sharedSort} />
                    <SortHeader label="Updated" col="date" {...sharedSort} />
                    <th className="px-4 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map(req => {
                    const isOwn = req.submittedBy?.id === user?.id;
                    const deletable = ["DRAFT", "SUBMITTED", "CANCELLED"].includes(req.status);
                    const canDel = isAdmin || (isOrgLead && deletable) || (isOwn && deletable);
                    return (
                      <tr key={req.id} className={`hover:bg-paper/70 transition-colors cursor-pointer group ${selected.has(req.id) ? "bg-navy/[0.03]" : ""}`}
                        onClick={() => window.location.href = `/requests/${req.id}`}>
                        {(canEdit || isStudent) && (
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(req.id)} onChange={() => toggleOne(req.id)} className="rounded border-border" />
                          </td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/requests/${req.id}`} className="font-mono text-xs text-navy hover:underline" onClick={e => e.stopPropagation()}>{req.number}</Link>
                          {isStudent && isOwn && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-semibold bg-stamp/10 text-stamp border border-stamp/20">Mine</span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <span className="font-medium text-ink truncate block">{req.title}</span>
                          {req.vendorName && <span className="text-xs text-ink-muted truncate block">{req.vendorName}</span>}
                          {/* Show submitter for non-own rows when student */}
                          {isStudent && !isOwn && req.submittedBy && (
                            <span className="text-xs text-ink-muted truncate block">by {req.submittedBy.name ?? req.submittedBy.email}</span>
                          )}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <InlineStatus requestId={req.id} status={req.status} canEdit={canEdit} onChanged={fetchRequests} />
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <InlineBudget requestId={req.id} budget={req.budget} budgets={budgets} canEdit={canEdit} onChanged={fetchRequests} />
                        </td>
                        {(isAdmin || (isStudent && orgList.length > 1)) && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-xs text-ink-secondary">{req.organization?.code}</span>
                            {req.organization?.costCenter && <span className="block text-xs text-ink-muted">CC: {req.organization.costCenter}</span>}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="text-xs font-medium text-ink-secondary">
                            {req.totalActual ? formatCurrency(req.totalActual) : req.totalEstimated ? formatCurrency(req.totalEstimated) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell whitespace-nowrap">
                          <span className="text-xs text-ink-muted">{formatDate(req.updatedAt)}</span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {canDel && (
                            <button onClick={e => handleDelete(req.id, e)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted hover:text-red-600 p-1 rounded" title="Delete">
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

function TabBtn({ children, active, onClick, danger }: { children: React.ReactNode; active: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? (danger ? "border-red-500 text-red-600" : "border-navy text-navy") : "border-transparent text-ink-secondary hover:text-ink"}`}>
      {children}
    </button>
  );
}
