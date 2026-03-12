"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { StatusBadge } from "@/components/requests/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  STATUS_LABELS,
  PRIORITY_LABELS,
  RequestStatus,
} from "@/lib/utils";

const STATUS_FLOW: RequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "ORDERED",
  "RECEIVED",
  "READY_FOR_PICKUP",
  "PICKED_UP",
];

const NEXT_STATUS_OPTIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED", "ON_HOLD"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED", "ON_HOLD"],
  APPROVED: ["ORDERED", "CANCELLED", "ON_HOLD"],
  REJECTED: ["DRAFT"],
  ORDERED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: ["READY_FOR_PICKUP"],
  READY_FOR_PICKUP: ["PICKED_UP"],
  PICKED_UP: [],
  CANCELLED: ["DRAFT"],
  ON_HOLD: ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "CANCELLED"],
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin action state
  const [adminNotes, setAdminNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [adminStaff, setAdminStaff] = useState<any[]>([]);

  useEffect(() => {
    fetchRequest();
    if (isAdmin) fetchAdminStaff();
  }, [id, isAdmin]);

  async function fetchRequest() {
    try {
      const res = await fetch(`/api/requests/${id}`);
      if (!res.ok) {
        setError("Request not found or access denied.");
        return;
      }
      const data = await res.json();
      setRequest(data.request);
      setAdminNotes(data.request.adminNotes || "");
      setNewStatus("");
    } catch {
      setError("Failed to load request.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAdminStaff() {
    try {
      const res = await fetch("/api/users?role=admin");
      if (res.ok) {
        const data = await res.json();
        setAdminStaff(data.users || []);
      }
    } catch {}
  }

  async function handleStatusUpdate() {
    if (!newStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/requests/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, notes: statusNote }),
      });
      if (res.ok) {
        await fetchRequest();
        setStatusNote("");
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSaveAdminNotes() {
    setSavingNotes(true);
    try {
      await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes }),
      });
      await fetchRequest();
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleAssignToMe() {
    try {
      await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: user?.id }),
      });
      await fetchRequest();
    } catch {}
  }

  async function handleSubmitRequest() {
    setUpdatingStatus(true);
    try {
      await fetch(`/api/requests/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SUBMITTED" }),
      });
      await fetchRequest();
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Header title="Loading..." />
        <div className="p-6">
          <div className="card p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 bg-paper rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div>
        <Header title="Error" />
        <div className="p-6">
          <div className="card p-6 text-center text-red-600">{error || "Request not found"}</div>
        </div>
      </div>
    );
  }

  const currentFlowIndex = STATUS_FLOW.indexOf(request.status as RequestStatus);
  const nextOptions = NEXT_STATUS_OPTIONS[request.status] || [];

  return (
    <div>
      <Header
        title={request.number}
        subtitle={request.title}
        actions={
          <div className="flex items-center gap-2">
            {request.status === "DRAFT" && request.submittedById === user?.id && (
              <Button variant="stamp" size="sm" onClick={handleSubmitRequest} disabled={updatingStatus}>
                Submit Request
              </Button>
            )}
            <StatusBadge status={request.status as RequestStatus} />
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status Timeline */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-4">Status Timeline</h2>
            <div className="flex items-center gap-0 overflow-x-auto pb-1">
              {STATUS_FLOW.map((status, index) => {
                const isCompleted = currentFlowIndex > index;
                const isCurrent = currentFlowIndex === index;
                const isTerminal = ["CANCELLED", "REJECTED", "ON_HOLD"].includes(request.status);
                return (
                  <div key={status} className="flex items-center">
                    <div className="flex flex-col items-center gap-1 min-w-[70px]">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isCompleted
                            ? "bg-navy border-navy"
                            : isCurrent && !isTerminal
                            ? "bg-white border-navy"
                            : isCurrent && isTerminal
                            ? "bg-red-100 border-red-400"
                            : "bg-white border-border"
                        }`}
                      >
                        {isCompleted && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {isCurrent && !isTerminal && (
                          <div className="w-2 h-2 bg-navy rounded-full" />
                        )}
                      </div>
                      <span className={`text-2xs text-center leading-tight ${isCurrent ? "text-navy font-semibold" : isCompleted ? "text-ink-secondary" : "text-ink-muted"}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    </div>
                    {index < STATUS_FLOW.length - 1 && (
                      <div className={`h-0.5 flex-1 min-w-[16px] mx-0.5 ${isCompleted ? "bg-navy" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            {["CANCELLED", "REJECTED", "ON_HOLD"].includes(request.status) && (
              <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                This request is currently <strong>{STATUS_LABELS[request.status as RequestStatus]}</strong>.
              </div>
            )}
          </div>

          {/* Request Details */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">
              Request Details
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Detail label="Organization" value={request.organization?.name} />
              <Detail label="Submitted By" value={request.submittedBy?.name || request.submittedBy?.email} />
              <Detail label="Priority" value={PRIORITY_LABELS[request.priority as keyof typeof PRIORITY_LABELS]} />
              <Detail label="Needed By" value={formatDate(request.neededBy)} />
              <Detail label="Advisor" value={request.advisorName || request.advisorEmail} />
              <Detail label="Advisor Email" value={request.advisorEmail} />
              {request.vendorName && <Detail label="Vendor" value={request.vendorName} />}
              {request.vendorUrl && (
                <div>
                  <p className="text-xs font-medium text-ink-muted mb-0.5">Vendor URL</p>
                  <a href={request.vendorUrl} target="_blank" rel="noreferrer" className="text-navy text-sm hover:underline truncate block">
                    {request.vendorUrl}
                  </a>
                </div>
              )}
            </div>

            {request.description && (
              <div>
                <p className="text-xs font-medium text-ink-muted mb-1">Description</p>
                <p className="text-sm text-ink">{request.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-ink-muted mb-1">Justification</p>
              <p className="text-sm text-ink">{request.justification}</p>
            </div>
          </div>

          {/* Line Items */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-ink">Line Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-paper/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Item</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">Qty</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">Unit Price</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {request.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{item.name}</p>
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-navy hover:underline">
                            View product
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-ink-secondary">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-paper/30">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-ink">
                      Estimated Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-ink">
                      {formatCurrency(request.totalEstimated)}
                    </td>
                  </tr>
                  {request.totalActual != null && (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm font-semibold text-ink">
                        Actual Total
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-bold text-navy">
                        {formatCurrency(request.totalActual)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {/* Audit Log */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink border-b border-border pb-3 mb-4">
              Activity Log
            </h2>
            {request.auditLogs.length === 0 ? (
              <p className="text-sm text-ink-muted">No activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {request.auditLogs.map((log: any) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex-shrink-0 w-1.5 h-1.5 bg-navy rounded-full mt-2" />
                    <div>
                      <p className="text-sm text-ink">{log.details || log.action}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {log.user?.name || "System"} &middot; {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Admin Actions */}
          {isAdmin && (
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">
                Admin Actions
              </h2>

              {/* Assign to self */}
              <div>
                <p className="text-xs text-ink-muted mb-1.5">Assigned To</p>
                <p className="text-sm text-ink mb-2">
                  {request.assignedTo?.name || <span className="text-ink-muted">Unassigned</span>}
                </p>
                {request.assignedToId !== user?.id && (
                  <Button variant="secondary" size="sm" onClick={handleAssignToMe} className="w-full">
                    Assign to Me
                  </Button>
                )}
                {request.assignedToId === user?.id && (
                  <span className="text-xs text-green-700 font-medium">Assigned to you</span>
                )}
              </div>

              {/* Status Update */}
              {nextOptions.length > 0 && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium text-ink-muted mb-2">Update Status</p>
                  <Select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="mb-2"
                  >
                    <option value="">Select new status...</option>
                    {nextOptions.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s as RequestStatus] || s}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    placeholder="Add a note (optional)"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={2}
                    className="mb-2"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={handleStatusUpdate}
                    disabled={!newStatus || updatingStatus}
                  >
                    {updatingStatus ? "Updating..." : "Update Status"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Admin Notes */}
          {isAdmin && (
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-ink">Admin Notes</h2>
              <Textarea
                placeholder="Internal notes visible only to admin staff..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={4}
              />
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={handleSaveAdminNotes}
                disabled={savingNotes}
              >
                {savingNotes ? "Saving..." : "Save Notes"}
              </Button>
            </div>
          )}

          {/* Approval Status */}
          {request.approvals.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink mb-3">Approvals</h2>
              <div className="space-y-3">
                {request.approvals.map((approval: any) => (
                  <div key={approval.id} className="text-sm">
                    <p className="font-medium text-ink">{approval.approverName || approval.approverEmail}</p>
                    <p className="text-xs text-ink-muted">{approval.approverEmail}</p>
                    <p className={`text-xs mt-0.5 font-medium ${
                      approval.status === "APPROVED" ? "text-green-700" :
                      approval.status === "REJECTED" ? "text-red-700" :
                      "text-amber-700"
                    }`}>
                      {approval.status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Dates */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-3">Key Dates</h2>
            <div className="space-y-2">
              <DateRow label="Created" value={request.createdAt} />
              <DateRow label="Submitted" value={request.submittedAt} />
              <DateRow label="Needed By" value={request.neededBy} />
              <DateRow label="Ordered" value={request.orderedAt} />
              <DateRow label="Received" value={request.receivedAt} />
              <DateRow label="Ready" value={request.readyAt} />
              <DateRow label="Picked Up" value={request.pickedUpAt} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-muted mb-0.5">{label}</p>
      <p className="text-sm text-ink">{value || "—"}</p>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink">{formatDate(value)}</span>
    </div>
  );
}
