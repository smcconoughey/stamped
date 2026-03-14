"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { AISummaryBox } from "@/components/dashboard/ai-summary-box";
import { RowStampButton } from "@/components/requests/row-stamp-button";
import {
  formatCurrency, PRIORITY_COLORS, PRIORITY_LABELS,
} from "@/lib/utils";

const PRIMARY_NEXT: Record<string, string> = {
  SUBMITTED: "APPROVED",
  PENDING_APPROVAL: "APPROVED",
  APPROVED: "ORDERED",
  ORDERED: "RECEIVED",
  RECEIVED: "READY_FOR_PICKUP",
  READY_FOR_PICKUP: "PICKED_UP",
};

const STATUS_META: Record<string, { label: string; cls: string; order: number }> = {
  SUBMITTED:          { label: "Submitted",        cls: "bg-blue-50 text-blue-700 border border-blue-200",     order: 1 },
  PENDING_APPROVAL:   { label: "Pending Approval", cls: "bg-yellow-50 text-yellow-700 border border-yellow-200", order: 2 },
  APPROVED:           { label: "Approved",         cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", order: 3 },
  ORDERED:            { label: "Ordered",          cls: "bg-indigo-50 text-indigo-700 border border-indigo-200",  order: 4 },
  PARTIALLY_RECEIVED: { label: "Partial",          cls: "bg-orange-50 text-orange-700 border border-orange-200",  order: 5 },
  RECEIVED:           { label: "Received",         cls: "bg-teal-50 text-teal-700 border border-teal-200",        order: 6 },
  READY_FOR_PICKUP:   { label: "Ready for Pickup", cls: "bg-purple-50 text-purple-700 border border-purple-200",  order: 7 },
  PICKED_UP:          { label: "Picked Up",        cls: "bg-gray-50 text-gray-600 border border-gray-200",        order: 8 },
};

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

const FILTER_TABS = [
  { label: "All Active", value: "" },
  { label: "My Queue",   value: "mine" },
  { label: "Submitted",  value: "SUBMITTED" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Approved",   value: "APPROVED" },
  { label: "Ordered",    value: "ORDERED" },
  { label: "Ready",      value: "READY_FOR_PICKUP" },
];

type SortCol = "date" | "number" | "amount" | "status" | "priority";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { label: string; col: SortCol }[] = [
  { label: "Date",     col: "date" },
  { label: "Number",   col: "number" },
  { label: "Amount",   col: "amount" },
  { label: "Status",   col: "status" },
  { label: "Priority", col: "priority" },
];

const EMAIL_ACTION_STATUSES = ["SUBMITTED", "PENDING_APPROVAL"];

// Confetti for PICKED_UP
const CONFETTI_COLORS = ["#10b981","#6366f1","#f59e0b","#ef4444","#3b82f6","#a855f7","#ec4899"];
function Confetti() {
  const p = Array.from({ length: 60 }, (_, i) => ({
    id: i, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${(i * 37 + 13) % 100}%`, size: ((i*7)%8)+4,
    delay: ((i*3)%8)*0.1, dur: ((i*11)%12)*0.15+2.2, wobble: ((i*13)%40)-20,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
      <style>{`@keyframes cf{0%{transform:translateY(-20px) rotate(0deg) translateX(0);opacity:1}85%{opacity:1}100%{transform:translateY(100vh) rotate(720deg) translateX(var(--w));opacity:0}}.cfp{animation:cf var(--d)s var(--dl)s ease-in forwards}`}</style>
      {p.map(x => (
        <div key={x.id} className="cfp absolute top-0 rounded-sm"
          style={{ left: x.left, width: x.size, height: x.size * 0.6, backgroundColor: x.color, "--d": x.dur, "--dl": x.delay, "--w": `${x.wobble}px` } as any} />
      ))}
    </div>
  );
}

export default function AdminQueuePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF","FINANCE_ADMIN","SUPER_ADMIN"].includes(user?.role);

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("");
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<string | null>(null);
  const [stampedIds, setStampedIds] = useState<Set<string>>(new Set());
  const [celebration, setCelebration] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => { if (!isAdmin && user) router.push("/"); }, [isAdmin, user]);
  useEffect(() => { fetchRequests(); }, [activeFilter]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter === "mine") params.set("assignedToMe", "true");
      else if (activeFilter) params.set("status", activeFilter);
      const res = await fetch(`/api/requests?${params}`);
      const data = await res.json();
      let reqs = data.requests || [];
      if (!activeFilter || activeFilter === "mine") {
        const active = ["SUBMITTED","PENDING_APPROVAL","APPROVED","ORDERED","PARTIALLY_RECEIVED","RECEIVED","READY_FOR_PICKUP"];
        reqs = reqs.filter((r: any) => active.includes(r.status));
      }
      setRequests(reqs);
    } catch { setRequests([]); }
    finally { setLoading(false); }
  }, [activeFilter]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "date" ? "desc" : "asc"); }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...requests].sort((a, b) => {
      switch (sortCol) {
        case "number": return dir * a.number.localeCompare(b.number);
        case "amount": {
          const av = a.totalActual ?? a.totalEstimated ?? 0;
          const bv = b.totalActual ?? b.totalEstimated ?? 0;
          return dir * (av - bv);
        }
        case "status": {
          const ao = STATUS_META[a.status]?.order ?? 99;
          const bo = STATUS_META[b.status]?.order ?? 99;
          return dir * (ao - bo);
        }
        case "priority": {
          const ap = PRIORITY_ORDER[a.priority] ?? 99;
          const bp = PRIORITY_ORDER[b.priority] ?? 99;
          return dir * (ap - bp);
        }
        default: { // date
          const ad = new Date(a.submittedAt ?? a.createdAt).getTime();
          const bd = new Date(b.submittedAt ?? b.createdAt).getTime();
          return dir * (ad - bd);
        }
      }
    });
  }, [requests, sortCol, sortDir]);

  async function stamp(requestId: string, newStatus: string) {
    await fetch(`/api/requests/${requestId}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setStampedIds(prev => { const n = new Set(prev); n.add(requestId); return n; });
    if (newStatus === "PICKED_UP") {
      setCelebration(true);
      setTimeout(() => setCelebration(false), 4000);
    }
    setTimeout(() => {
      setStampedIds(prev => { const n = new Set(prev); n.delete(requestId); return n; });
      fetchRequests();
    }, 500);
  }

  async function sendApprovalEmail(requestId: string) {
    setEmailingId(requestId);
    try {
      const res = await fetch("/api/email/send-approval", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (data.mode === "draft") alert(`Draft:\nTo: ${data.to}\n\n${data.body}`);
      else if (res.ok) await fetchRequests();
      else alert(data.error ?? "Failed to send email");
    } finally { setEmailingId(null); }
  }

  async function pollInbox() {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/email/poll", { method: "POST" });
      const data = await res.json();
      if (data.error) { setPollResult(`Error: ${data.error}`); return; }
      const matched = data.matched ?? 0;
      setPollResult(matched > 0 ? `Processed ${matched} reply email${matched !== 1 ? "s" : ""}.` : "No matching replies found.");
      if (matched > 0) await fetchRequests();
    } finally { setPolling(false); }
  }

  if (!isAdmin) return null;

  return (
    <div>
      <style>{`
        @keyframes stampFlash {
          0%   { background-color: transparent; }
          20%  { background-color: rgba(16,185,129,0.15); }
          100% { background-color: transparent; opacity: 0.4; }
        }
        .stamp-flash { animation: stampFlash 0.5s ease-out forwards; }
      `}</style>

      {celebration && <Confetti />}

      <Header title="Admin Queue" subtitle="Stamp requests through the pipeline"
        actions={
          <div className="flex items-center gap-2">
            {pollResult && <span className="text-xs text-ink-secondary">{pollResult}</span>}
            <Button variant="secondary" size="sm" onClick={pollInbox} disabled={polling}>
              {polling ? "Checking…" : "Poll Inbox"}
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        <AISummaryBox />

        {/* Filter tabs with counts */}
        <div className="flex flex-wrap gap-0 border-b border-border">
          {FILTER_TABS.map(tab => {
            const count = tab.value && tab.value !== "mine"
              ? requests.filter(r => r.status === tab.value).length
              : tab.value === "" ? requests.length : null;
            return (
              <button key={tab.value} onClick={() => setActiveFilter(tab.value)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeFilter === tab.value ? "border-navy text-navy" : "border-transparent text-ink-secondary hover:text-ink"
                }`}>
                {tab.label}
                {count != null && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Sort controls */}
        {!loading && requests.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-ink-muted mr-1">Sort:</span>
            {SORT_OPTIONS.map(opt => (
              <button key={opt.col} onClick={() => toggleSort(opt.col)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${
                  sortCol === opt.col
                    ? "bg-navy text-white border-navy"
                    : "bg-white text-ink-secondary border-border hover:border-navy hover:text-navy"
                }`}>
                {opt.label}
                {sortCol === opt.col && (
                  <span className="text-[10px] opacity-80">{sortDir === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Request rows */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card p-4 flex gap-4">
                {[60, 200, 100, 80].map((w, j) => <div key={j} className="h-4 bg-paper rounded animate-pulse" style={{ width: w }} />)}
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-ink font-medium">Queue is clear!</p>
            <p className="text-sm text-ink-muted mt-1">No active requests need action right now.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(req => {
              const primaryNext = PRIMARY_NEXT[req.status];
              const meta = STATUS_META[req.status];
              const isStamped = stampedIds.has(req.id);
              return (
                <div key={req.id}
                  className={`card p-0 overflow-hidden transition-all duration-300 ${isStamped ? "stamp-flash" : "hover:shadow-md"}`}>
                  <div className="flex items-stretch">
                    {/* Status accent bar */}
                    <div className={`w-1 shrink-0 ${
                      req.status === "SUBMITTED" ? "bg-blue-400" :
                      req.status === "PENDING_APPROVAL" ? "bg-yellow-400" :
                      req.status === "APPROVED" ? "bg-emerald-500" :
                      req.status === "ORDERED" ? "bg-indigo-500" :
                      req.status === "RECEIVED" ? "bg-teal-500" :
                      req.status === "READY_FOR_PICKUP" ? "bg-purple-500" : "bg-border"
                    }`} />

                    {/* Main content — fixed column widths so rows stay aligned */}
                    <div className="flex-1 flex items-center gap-4 px-4 py-3 min-w-0">
                      {/* Request number — fixed w-24 */}
                      <Link href={`/requests/${req.id}`} onClick={e => e.stopPropagation()}
                        className="font-mono text-xs text-navy hover:underline shrink-0 w-24 truncate">
                        {req.number}
                      </Link>

                      {/* Title + org — flex-1 */}
                      <div className="flex-1 min-w-0">
                        <Link href={`/requests/${req.id}`}
                          className="font-medium text-ink hover:text-navy truncate block text-sm">
                          {req.title}
                        </Link>
                        <p className="text-xs text-ink-muted truncate">
                          {req.organization?.code}
                          {req.vendorName && ` · ${req.vendorName}`}
                          {req.submittedBy?.name && ` · ${req.submittedBy.name}`}
                        </p>
                      </div>

                      {/* Amount — fixed w-20, right-aligned */}
                      <span className="text-sm font-medium text-ink-secondary shrink-0 w-20 text-right hidden sm:block">
                        {req.totalActual ? formatCurrency(req.totalActual) : req.totalEstimated ? formatCurrency(req.totalEstimated) : "—"}
                      </span>

                      {/* Status badge — fixed w-32 */}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 w-32 text-center hidden md:inline-flex items-center justify-center ${meta?.cls ?? "bg-paper text-ink-muted"}`}>
                        {meta?.label ?? req.status}
                      </span>

                      {/* Priority — fixed w-14, only non-NORMAL */}
                      <span className={`text-xs font-medium shrink-0 w-14 hidden lg:block ${
                        req.priority && req.priority !== "NORMAL"
                          ? PRIORITY_COLORS[req.priority as keyof typeof PRIORITY_COLORS] ?? ""
                          : "text-transparent"
                      }`}>
                        {req.priority && req.priority !== "NORMAL"
                          ? PRIORITY_LABELS[req.priority as keyof typeof PRIORITY_LABELS] ?? req.priority
                          : "·"}
                      </span>
                    </div>

                    {/* Action zone — fixed w-56 so every row is identical width */}
                    <div className="flex items-center justify-end gap-2 px-4 py-3 border-l border-border bg-paper/30 w-56 shrink-0">
                      {/* Email button — fixed w-14 space, visible only for relevant statuses */}
                      <div className="w-14 flex justify-center">
                        {EMAIL_ACTION_STATUSES.includes(req.status) ? (
                          <button onClick={() => sendApprovalEmail(req.id)} disabled={emailingId === req.id}
                            className="text-xs text-ink-secondary hover:text-navy border border-border rounded px-2 py-1 hover:bg-white transition-colors disabled:opacity-50 w-full text-center">
                            {emailingId === req.id ? "…" : "Email"}
                          </button>
                        ) : null}
                      </div>

                      {/* Stamp button — fixed w-32 space always reserved */}
                      <div className="w-32 flex justify-center">
                        {primaryNext ? (
                          <RowStampButton
                            targetStatus={primaryNext}
                            onStamp={s => stamp(req.id, s)}
                            disabled={isStamped}
                          />
                        ) : null}
                      </div>

                      {/* Open icon — fixed size */}
                      <Link href={`/requests/${req.id}`} className="shrink-0">
                        <button className="text-xs text-ink-muted hover:text-navy p-1.5 rounded hover:bg-white transition-colors" title="Open">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
