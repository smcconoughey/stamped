"use client";

import { useState, useEffect } from "react";
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

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Ordered", value: "ORDERED" },
  { label: "Ready for Pickup", value: "READY_FOR_PICKUP" },
  { label: "Picked Up", value: "PICKED_UP" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function RequestsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("");

  useEffect(() => {
    fetchRequests();
  }, [activeStatus]);

  async function fetchRequests() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeStatus) params.set("status", activeStatus);
      if (search) params.set("search", search);
      const res = await fetch(`/api/requests?${params}`);
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchRequests();
  }

  return (
    <div>
      <Header
        title={isAdmin ? "All Requests" : "My Requests"}
        subtitle={isAdmin ? "View and manage all purchase requests" : "Track your submitted purchase requests"}
        actions={
          <Link href="/requests/new" className="btn-stamp">
            New Request
          </Link>
        }
      />

      <div className="p-6 space-y-4">
        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <Input
              placeholder="Search by number, title, or org..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" variant="secondary" size="md">
              Search
            </Button>
          </form>
        </div>

        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-border pb-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveStatus(tab.value)}
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
                  <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">
                    Date
                  </th>
                  {isAdmin && (
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden xl:table-cell">
                      Assigned To
                    </th>
                  )}
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
                      No requests found.{" "}
                      <Link href="/requests/new" className="text-navy hover:underline">
                        Submit a new request
                      </Link>
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-paper transition-colors cursor-pointer"
                      onClick={() => (window.location.href = `/requests/${req.id}`)}
                    >
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
                        {isAdmin && req.submittedBy && (
                          <span className="text-xs text-ink-muted">{req.submittedBy.name}</span>
                        )}
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
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <span className="text-xs text-ink-muted">{formatDate(req.createdAt)}</span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-xs text-ink-secondary">
                            {req.assignedTo?.name || <span className="text-ink-muted">Unassigned</span>}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
