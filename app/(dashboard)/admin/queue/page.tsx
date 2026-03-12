"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { StatusBadge } from "@/components/requests/status-badge";
import { Button } from "@/components/ui/button";
import { AISummaryBox } from "@/components/dashboard/ai-summary-box";
import {
  formatDate,
  formatCurrency,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  RequestStatus,
} from "@/lib/utils";

const QUICK_ACTIONS: { label: string; from: string[]; to: string; variant: "primary" | "secondary" | "stamp" }[] = [
  { label: "Mark Ordered", from: ["APPROVED"], to: "ORDERED", variant: "primary" },
  { label: "Mark Received", from: ["ORDERED", "PARTIALLY_RECEIVED"], to: "RECEIVED", variant: "primary" },
  { label: "Ready for Pickup", from: ["RECEIVED"], to: "READY_FOR_PICKUP", variant: "stamp" },
  { label: "Mark Picked Up", from: ["READY_FOR_PICKUP"], to: "PICKED_UP", variant: "secondary" },
];

const EMAIL_ACTION_STATUSES = ["SUBMITTED", "PENDING_APPROVAL"];

const FILTER_TABS = [
  { label: "All Active", value: "" },
  { label: "My Queue", value: "mine" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Ordered", value: "ORDERED" },
  { label: "Ready for Pickup", value: "READY_FOR_PICKUP" },
];

export default function AdminQueuePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin && user) {
      router.push("/");
    }
  }, [isAdmin, user]);

  useEffect(() => {
    fetchRequests();
  }, [activeFilter]);

  async function fetchRequests() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter === "mine") {
        params.set("assignedToMe", "true");
      } else if (activeFilter) {
        params.set("status", activeFilter);
      } else {
        // Default: all active statuses
        params.set("status", "");
      }
      const res = await fetch(`/api/requests?${params}`);
      const data = await res.json();

      let reqs = data.requests || [];
      // Filter to only active statuses by default
      if (!activeFilter) {
        const activeStatuses = ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "READY_FOR_PICKUP"];
        reqs = reqs.filter((r: any) => activeStatuses.includes(r.status));
      } else if (activeFilter === "mine") {
        const activeStatuses = ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "READY_FOR_PICKUP"];
        reqs = reqs.filter((r: any) => activeStatuses.includes(r.status));
      }

      setRequests(reqs);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  async function quickStatusUpdate(requestId: string, newStatus: string) {
    setUpdatingId(requestId);
    try {
      const res = await fetch(`/api/requests/${requestId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await fetchRequests();
    } finally {
      setUpdatingId(null);
    }
  }

  async function sendApprovalEmail(requestId: string) {
    setEmailingId(requestId);
    try {
      const res = await fetch("/api/email/send-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (data.mode === "draft") {
        alert(`Draft (Graph not configured):\n\nTo: ${data.to}\n\n${data.body}`);
      } else if (res.ok) {
        await fetchRequests();
      } else {
        alert(data.error ?? "Failed to send email");
      }
    } finally {
      setEmailingId(null);
    }
  }

  async function pollInbox() {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/email/poll", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setPollResult(`Error: ${data.error}`);
      } else {
        const matched = data.matched ?? 0;
        setPollResult(
          matched > 0
            ? `Processed ${matched} reply email${matched !== 1 ? "s" : ""}. Refreshing...`
            : `Checked inbox — no matching replies found.`
        );
        if (matched > 0) await fetchRequests();
      }
    } finally {
      setPolling(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <div>
      <Header
        title="Admin Queue"
        subtitle="Manage and process active purchase requests"
      />

      <div className="p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div />
          <div className="flex items-center gap-2">
            {pollResult && (
              <span className="text-xs text-ink-secondary">{pollResult}</span>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={pollInbox}
              disabled={polling}
            >
              {polling ? "Checking inbox..." : "Poll Inbox for Replies"}
            </Button>
          </div>
        </div>

        {/* AI Summary */}
        <AISummaryBox />

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-3 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                activeFilter === tab.value
                  ? "border-navy text-navy"
                  : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-paper/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Number
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Title
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">
                    Org
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">
                    Priority
                  </th>
                  <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">
                    Total
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden xl:table-cell">
                    Assigned
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {[1, 2, 3, 4, 5].map((j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-paper rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                      No active requests in the queue.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => {
                    const availableActions = QUICK_ACTIONS.filter((a) => a.from.includes(req.status));
                    return (
                      <tr key={req.id} className="hover:bg-paper transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/requests/${req.id}`}
                            className="font-mono text-xs text-navy hover:underline"
                          >
                            {req.number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <Link
                            href={`/requests/${req.id}`}
                            className="font-medium text-ink hover:text-navy truncate block"
                          >
                            {req.title}
                          </Link>
                          <span className="text-xs text-ink-muted">{req.submittedBy?.name}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-ink-secondary">{req.organization?.code}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={req.status as RequestStatus} size="sm" />
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className={`text-xs ${PRIORITY_COLORS[req.priority as keyof typeof PRIORITY_COLORS] || ""}`}>
                            {PRIORITY_LABELS[req.priority as keyof typeof PRIORITY_LABELS] || req.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className="text-xs text-ink-secondary">
                            {formatCurrency(req.totalEstimated)}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-xs text-ink-secondary">
                            {req.assignedTo?.name || <span className="text-ink-muted">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Email action for submitted/pending */}
                            {EMAIL_ACTION_STATUSES.includes(req.status) && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => sendApprovalEmail(req.id)}
                                disabled={emailingId === req.id}
                              >
                                {emailingId === req.id ? "..." : "Send Approval Email"}
                              </Button>
                            )}
                            {availableActions.map((action) => (
                              <Button
                                key={action.to}
                                variant={action.variant}
                                size="sm"
                                onClick={() => quickStatusUpdate(req.id, action.to)}
                                disabled={updatingId === req.id}
                              >
                                {updatingId === req.id ? "..." : action.label}
                              </Button>
                            ))}
                            <Link href={`/requests/${req.id}`}>
                              <Button variant="ghost" size="sm">View</Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
