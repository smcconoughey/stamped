"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  "DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED",
  "ORDERED", "RECEIVED", "READY_FOR_PICKUP", "PICKED_UP",
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

// Primary "next" stamp — the obvious happy path action
const PRIMARY_NEXT: Record<string, string> = {
  SUBMITTED: "APPROVED",
  PENDING_APPROVAL: "APPROVED",
  APPROVED: "ORDERED",
  ORDERED: "RECEIVED",
  RECEIVED: "READY_FOR_PICKUP",
  READY_FOR_PICKUP: "PICKED_UP",
};

const STAMP_CONFIG: Record<string, { label: string; verb: string; color: string; bg: string; border: string; glow: string; ink: string }> = {
  APPROVED:         { label: "Approved",       verb: "APPROVE",       color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-400", glow: "shadow-emerald-200", ink: "#10b981" },
  ORDERED:          { label: "Ordered",        verb: "MARK ORDERED",  color: "text-indigo-700",  bg: "bg-indigo-50",   border: "border-indigo-400",  glow: "shadow-indigo-200",  ink: "#6366f1" },
  RECEIVED:         { label: "Received",       verb: "MARK RECEIVED", color: "text-teal-700",    bg: "bg-teal-50",     border: "border-teal-400",    glow: "shadow-teal-200",    ink: "#14b8a6" },
  READY_FOR_PICKUP: { label: "Ready",          verb: "MARK READY",    color: "text-purple-700",  bg: "bg-purple-50",   border: "border-purple-400",  glow: "shadow-purple-200",  ink: "#a855f7" },
  PICKED_UP:        { label: "Picked Up",      verb: "PICKED UP ✓",   color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-400",   glow: "shadow-amber-200",   ink: "#f59e0b" },
  SUBMITTED:        { label: "Submitted",      verb: "SUBMIT",        color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-400",    glow: "shadow-blue-200",    ink: "#3b82f6" },
  PENDING_APPROVAL: { label: "Pending",        verb: "SEND FOR APPROVAL", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-400", glow: "shadow-yellow-200", ink: "#eab308" },
  CANCELLED:        { label: "Cancelled",      verb: "CANCEL",        color: "text-red-700",     bg: "bg-red-50",      border: "border-red-400",     glow: "shadow-red-200",     ink: "#ef4444" },
};

// ─── Confetti ───────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["#10b981","#6366f1","#f59e0b","#ef4444","#3b82f6","#a855f7","#ec4899","#14b8a6"];
function Confetti() {
  const particles = Array.from({ length: 90 }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${(i * 37 + 13) % 100}%`,
    size: ((i * 7) % 8) + 5,
    delay: ((i * 3) % 10) * 0.08,
    dur: ((i * 11) % 15) * 0.15 + 2.5,
    rotate: (i * 47) % 360,
    wobble: ((i * 13) % 40) - 20,
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg) translateX(0); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg) translateX(var(--wobble)); opacity: 0; }
        }
        .confetti-piece { animation: confetti-fall var(--dur)s var(--delay)s ease-in forwards; }
      `}</style>
      {particles.map(p => (
        <div key={p.id} className="confetti-piece absolute top-0 rounded-sm"
          style={{
            left: p.left, width: p.size, height: p.size * 0.6,
            backgroundColor: p.color,
            "--dur": p.dur, "--delay": p.delay, "--wobble": `${p.wobble}px`,
          } as any}
        />
      ))}
    </div>
  );
}

// ─── Ink burst ───────────────────────────────────────────────────────────────
function InkBurst({ color, trigger }: { color: string; trigger: number }) {
  const particles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * 360;
    const dist  = 32 + (i % 3) * 18;
    const size  = 5 + (i % 4) * 3;
    return { angle, dist, size };
  });

  if (!trigger) return null;
  return (
    <div key={trigger} className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible">
      <style>{`
        @keyframes ink-ring  { 0%{transform:scale(0);opacity:.7} 100%{transform:scale(3);opacity:0} }
        @keyframes ink-dot   { 0%{transform:translate(0,0) scale(1);opacity:.9} 100%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:0} }
      `}</style>
      {/* Ring */}
      <div className="absolute w-16 h-16 rounded-full border-[3px]"
        style={{ borderColor: color, animation: "ink-ring 0.5s ease-out forwards" }} />
      {/* Particles */}
      {particles.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * p.dist;
        const ty = Math.sin(rad) * p.dist;
        return (
          <div key={i} className="absolute rounded-full"
            style={{
              width: p.size, height: p.size, backgroundColor: color, opacity: 0,
              "--tx": `${tx}px`, "--ty": `${ty}px`,
              animation: `ink-dot 0.45s ${i * 0.015}s ease-out forwards`,
            } as any}
          />
        );
      })}
    </div>
  );
}

// ─── Stamp Button ───────────────────────────────────────────────────────────
function StampButton({ targetStatus, onStamp, stamping }: {
  targetStatus: string; onStamp: (s: string) => void; stamping: boolean;
}) {
  const cfg = STAMP_CONFIG[targetStatus];
  const [pressed, setPressed] = useState(false);
  const [inkTrigger, setInkTrigger] = useState(0);
  if (!cfg) return null;

  function handleClick() {
    if (stamping) return;
    setPressed(true);
    setInkTrigger(t => t + 1);
    setTimeout(() => setPressed(false), 420);
    onStamp(targetStatus);
  }

  return (
    <div className="relative flex items-center justify-center py-2">
      <style>{`
        @keyframes stamp-press {
          0%   { transform: perspective(400px) rotateX(0deg)   scale(1)    translateY(0); }
          25%  { transform: perspective(400px) rotateX(8deg)   scale(0.93) translateY(8px); filter: drop-shadow(0 2px 8px ${cfg.ink}88); }
          55%  { transform: perspective(400px) rotateX(-3deg)  scale(1.04) translateY(-4px); }
          75%  { transform: perspective(400px) rotateX(1deg)   scale(0.99) translateY(1px); }
          100% { transform: perspective(400px) rotateX(0deg)   scale(1)    translateY(0); }
        }
        @keyframes stamp-idle {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
        @keyframes stamp-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <button
        onClick={handleClick}
        disabled={stamping}
        className={`relative select-none cursor-pointer group disabled:cursor-not-allowed`}
        style={{ animation: pressed ? "stamp-press 0.42s ease-out" : "stamp-idle 2.8s ease-in-out infinite" }}
      >
        {/* Stamp handle */}
        <div className={`mx-auto w-16 h-2.5 rounded-t-sm ${cfg.bg} ${cfg.border} border-x border-t mb-0`} />
        <div className={`mx-auto w-24 h-1.5 ${cfg.bg} ${cfg.border} border-x`} />

        {/* Stamp face */}
        <div className={`relative px-6 py-4 border-2 border-dashed rounded-sm ${cfg.border} ${cfg.bg}
          transition-shadow duration-200 ${pressed ? `shadow-2xl ${cfg.glow}` : `shadow-md group-hover:shadow-xl group-hover:${cfg.glow}`}
          min-w-[160px] text-center`}
        >
          {/* Ink texture overlay */}
          <div className="absolute inset-0 opacity-5 rounded-sm"
            style={{ backgroundImage: "repeating-linear-gradient(0deg, currentColor 0px, transparent 1px, transparent 3px)" }} />

          <p className={`text-[10px] font-bold tracking-[0.25em] uppercase opacity-60 ${cfg.color} mb-0.5`}>stamped</p>
          <p className={`text-2xl font-black tracking-wider uppercase ${cfg.color} leading-none`}
            style={{ textShadow: `0 1px 0 ${cfg.ink}44`, fontFamily: "Georgia, serif", letterSpacing: "0.12em" }}>
            {cfg.verb}
          </p>
          {pressed && (
            <div className="absolute inset-0 rounded-sm pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at center, ${cfg.ink}22 0%, transparent 70%)`,
                animation: "none",
              }} />
          )}
        </div>

        {/* Ink effect */}
        <InkBurst color={cfg.ink} trigger={inkTrigger} />
      </button>
    </div>
  );
}

// ─── Animated Timeline Node ──────────────────────────────────────────────────
function TimelineNode({ status, isCompleted, isCurrent, isTerminal, justCompleted }: {
  status: RequestStatus; isCompleted: boolean; isCurrent: boolean; isTerminal: boolean; justCompleted: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[70px]">
      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
        isCompleted
          ? "bg-navy border-navy"
          : isCurrent && !isTerminal
          ? "bg-white border-navy"
          : isCurrent && isTerminal
          ? "bg-red-100 border-red-400"
          : "bg-white border-border"
      } ${justCompleted ? "scale-125" : ""}`}
        style={{ transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), background 0.4s, border-color 0.4s" }}>
        {isCompleted && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={justCompleted ? "animate-ping-once" : ""}>
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={justCompleted ? { strokeDasharray: 20, strokeDashoffset: 0, animation: "draw-check 0.3s ease-out" } : undefined} />
          </svg>
        )}
        {isCurrent && !isTerminal && <div className="w-2.5 h-2.5 bg-navy rounded-full animate-pulse" />}
      </div>
      <span className={`text-2xs text-center leading-tight transition-colors duration-300 ${
        isCurrent ? "text-navy font-bold" : isCompleted ? "text-ink-secondary" : "text-ink-muted"
      }`}>
        {STATUS_LABELS[status]}
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  const isOrgLead = user?.role === "ORG_LEAD";

  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [lastStampedStatus, setLastStampedStatus] = useState<string | null>(null);
  const [celebration, setCelebration] = useState(false);
  const [badgePop, setBadgePop] = useState(false);

  useEffect(() => { fetchRequest(); }, [id]);

  async function fetchRequest() {
    try {
      const res = await fetch(`/api/requests/${id}`);
      if (!res.ok) { setError("Request not found or access denied."); return; }
      const data = await res.json();
      setRequest(data.request);
      setAdminNotes(data.request.adminNotes || "");
      setNewStatus("");
    } catch { setError("Failed to load request."); }
    finally { setLoading(false); }
  }

  async function handleStamp(targetStatus: string) {
    if (stamping) return;
    setStamping(true);
    // Let the press animation run for ~200ms before the network call
    await new Promise(r => setTimeout(r, 180));
    try {
      await fetch(`/api/requests/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus, notes: statusNote }),
      });
      setLastStampedStatus(targetStatus);
      setBadgePop(true);
      setTimeout(() => setBadgePop(false), 600);
      if (targetStatus === "PICKED_UP") {
        setCelebration(true);
        setTimeout(() => setCelebration(false), 5000);
      }
      await fetchRequest();
    } finally { setStamping(false); }
  }

  async function handleStatusUpdate() {
    if (!newStatus) return;
    setUpdatingStatus(true);
    try {
      await fetch(`/api/requests/${id}/status`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, notes: statusNote }),
      });
      setBadgePop(true);
      setTimeout(() => setBadgePop(false), 600);
      await fetchRequest();
      setStatusNote("");
    } finally { setUpdatingStatus(false); }
  }

  async function handleSaveAdminNotes() {
    setSavingNotes(true);
    try {
      await fetch(`/api/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminNotes }) });
      await fetchRequest();
    } finally { setSavingNotes(false); }
  }

  async function handleAssignToMe() {
    try {
      await fetch(`/api/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignedToId: user?.id }) });
      await fetchRequest();
    } catch {}
  }

  async function handleSubmitRequest() {
    setUpdatingStatus(true);
    try {
      await fetch(`/api/requests/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "SUBMITTED" }) });
      await fetchRequest();
    } finally { setUpdatingStatus(false); }
  }

  async function handleDelete() {
    if (!confirm("Permanently delete this request? This cannot be undone.")) return;
    const res = await fetch(`/api/requests/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/requests");
  }

  if (loading) {
    return (
      <div>
        <Header title="Loading..." />
        <div className="p-6">
          <div className="card p-6 space-y-3">
            {[1,2,3,4].map(i => <div key={i} className="h-5 bg-paper rounded animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div>
        <Header title="Error" />
        <div className="p-6"><div className="card p-6 text-center text-red-600">{error || "Request not found"}</div></div>
      </div>
    );
  }

  const currentFlowIndex = STATUS_FLOW.indexOf(request.status as RequestStatus);
  const ALL_STATUSES = ["DRAFT","SUBMITTED","PENDING_APPROVAL","APPROVED","ORDERED","PARTIALLY_RECEIVED","RECEIVED","READY_FOR_PICKUP","PICKED_UP","CANCELLED"];
  const nextOptions = (isAdmin || isOrgLead)
    ? ALL_STATUSES.filter(s => s !== request.status)
    : NEXT_STATUS_OPTIONS[request.status] || [];

  const canDelete = isAdmin || (["DRAFT","SUBMITTED","CANCELLED"].includes(request.status) && (user?.role === "ORG_LEAD" || request.submittedById === user?.id));
  const primaryNext = PRIMARY_NEXT[request.status];

  return (
    <div>
      <style>{`
        @keyframes badge-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.35); }
          70%  { transform: scale(0.92); }
          100% { transform: scale(1); }
        }
        @keyframes draw-check {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes line-fill {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .badge-pop { animation: badge-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .confetti-piece { animation: confetti-fall var(--dur)s var(--delay)s ease-in forwards; }
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg) translateX(0); opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg) translateX(var(--wobble)); opacity: 0; }
        }
      `}</style>

      {celebration && <Confetti />}

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
            {canDelete && (
              <Button variant="secondary" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                Delete
              </Button>
            )}
            <span className={badgePop ? "badge-pop" : ""}>
              <StatusBadge status={request.status as RequestStatus} />
            </span>
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">

          {/* Status Timeline */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink mb-4">Status Timeline</h2>
            <div className="flex items-center gap-0 overflow-x-auto pb-1">
              {STATUS_FLOW.map((status, index) => {
                const isCompleted = currentFlowIndex > index;
                const isCurrent = currentFlowIndex === index;
                const isTerminal = ["CANCELLED","REJECTED","ON_HOLD"].includes(request.status);
                const justCompleted = lastStampedStatus != null && STATUS_FLOW.indexOf(lastStampedStatus as RequestStatus) >= index && isCompleted;
                return (
                  <div key={status} className="flex items-center">
                    <TimelineNode status={status} isCompleted={isCompleted} isCurrent={isCurrent} isTerminal={isTerminal} justCompleted={justCompleted} />
                    {index < STATUS_FLOW.length - 1 && (
                      <div className="relative h-0.5 flex-1 min-w-[16px] mx-0.5 bg-border overflow-hidden">
                        {isCompleted && (
                          <div className="absolute inset-y-0 left-0 bg-navy"
                            style={{ width: "100%", transition: "width 0.6s ease", transitionDelay: `${index * 80}ms` }} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {["CANCELLED","REJECTED","ON_HOLD"].includes(request.status) && (
              <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
                This request is currently <strong>{STATUS_LABELS[request.status as RequestStatus]}</strong>.
              </div>
            )}
          </div>

          {/* Request Details */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">Request Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Detail label="Organization" value={request.organization?.name} />
              <Detail label="Submitted By" value={request.submittedBy?.name || request.submittedBy?.email} />
              <Detail label="Priority" value={PRIORITY_LABELS[request.priority as keyof typeof PRIORITY_LABELS]} />
              <Detail label="Needed By" value={formatDate(request.neededBy)} />
              {request.advisorEmail && request.advisorEmail !== request.submittedBy?.email && request.advisorEmail !== "tbd@university.edu" && (
                <>
                  <Detail label="Advisor" value={request.advisorName || request.advisorEmail} />
                  <Detail label="Advisor Email" value={request.advisorEmail} />
                </>
              )}
              {request.vendorName && <Detail label="Vendor" value={request.vendorName} />}
              {request.vendorUrl && (
                <div>
                  <p className="text-xs font-medium text-ink-muted mb-0.5">Vendor URL</p>
                  <a href={request.vendorUrl} target="_blank" rel="noreferrer" className="text-navy text-sm hover:underline truncate block">{request.vendorUrl}</a>
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
                        {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-navy hover:underline">View product</a>}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-secondary">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-ink-secondary">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border bg-paper/30">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-ink">Estimated Total</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-ink">{formatCurrency(request.totalEstimated)}</td>
                  </tr>
                  {request.totalActual != null && (
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm font-semibold text-ink">Actual Total</td>
                      <td className="px-4 py-2 text-right text-sm font-bold text-navy">{formatCurrency(request.totalActual)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {/* Activity Log */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink border-b border-border pb-3 mb-4">Activity Log</h2>
            {request.auditLogs.length === 0 ? (
              <p className="text-sm text-ink-muted">No activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {request.auditLogs.map((log: any) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex-shrink-0 w-1.5 h-1.5 bg-navy rounded-full mt-2" />
                    <div>
                      <p className="text-sm text-ink">{log.details || log.action}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{log.user?.name || "System"} &middot; {formatDateTime(log.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* ── STAMP ZONE ── */}
          {(isAdmin || isOrgLead) && nextOptions.length > 0 && (
            <div className="card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">
                {request.status === "PICKED_UP" ? "Complete ✓" : "Stamp & Advance"}
              </h2>

              {/* Big primary stamp */}
              {primaryNext && nextOptions.includes(primaryNext) && (
                <div className="flex flex-col items-center">
                  <p className="text-xs text-ink-muted mb-1 text-center">One click to advance</p>
                  <StampButton targetStatus={primaryNext} onStamp={handleStamp} stamping={stamping} />
                  {stamping && (
                    <p className="text-xs text-ink-muted mt-2 animate-pulse text-center">Stamping…</p>
                  )}
                </div>
              )}

              {/* Quick stamp row for other common options */}
              {(() => {
                const others = nextOptions.filter(s => s !== primaryNext && s !== "CANCELLED" && STAMP_CONFIG[s]);
                if (!others.length) return null;
                return (
                  <div>
                    <p className="text-xs text-ink-muted mb-2">Other options</p>
                    <div className="flex flex-wrap gap-2">
                      {others.map(s => {
                        const cfg = STAMP_CONFIG[s];
                        if (!cfg) return null;
                        return (
                          <button key={s} onClick={() => handleStamp(s)} disabled={stamping}
                            className={`px-3 py-1.5 text-xs font-bold rounded border-2 ${cfg.border} ${cfg.bg} ${cfg.color} uppercase tracking-wide hover:opacity-90 disabled:opacity-50 transition-all active:scale-95`}>
                            {cfg.verb}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Optional note */}
              <div>
                <Textarea
                  placeholder="Add a note (optional)"
                  value={statusNote}
                  onChange={e => setStatusNote(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Force override — any status */}
              <details className="group">
                <summary className="text-xs text-ink-muted cursor-pointer hover:text-ink list-none flex items-center gap-1 select-none">
                  <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  Force override any status
                </summary>
                <div className="mt-2 space-y-2">
                  <Select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                    <option value="">Select status…</option>
                    {nextOptions.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s as RequestStatus] || s}</option>
                    ))}
                  </Select>
                  <Button variant="primary" size="sm" className="w-full" onClick={handleStatusUpdate} disabled={!newStatus || updatingStatus}>
                    {updatingStatus ? "Updating…" : "Force Update"}
                  </Button>
                </div>
              </details>
            </div>
          )}

          {/* Assignment */}
          {isAdmin && (
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">Assignment</h2>
              <div>
                <p className="text-xs text-ink-muted mb-1.5">Assigned To</p>
                <p className="text-sm text-ink mb-2">{request.assignedTo?.name || <span className="text-ink-muted">Unassigned</span>}</p>
                {request.assignedToId !== user?.id ? (
                  <Button variant="secondary" size="sm" onClick={handleAssignToMe} className="w-full">Assign to Me</Button>
                ) : (
                  <span className="text-xs text-green-700 font-medium">Assigned to you</span>
                )}
              </div>
            </div>
          )}

          {/* Admin Notes */}
          {isAdmin && (
            <div className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-ink">Admin Notes</h2>
              <Textarea placeholder="Internal notes visible only to admin staff…" value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={4} />
              <Button variant="secondary" size="sm" className="w-full" onClick={handleSaveAdminNotes} disabled={savingNotes}>
                {savingNotes ? "Saving…" : "Save Notes"}
              </Button>
            </div>
          )}

          {/* Approvals */}
          {request.approvals.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink mb-3">Approvals</h2>
              <div className="space-y-3">
                {request.approvals.map((approval: any) => (
                  <div key={approval.id} className="text-sm">
                    <p className="font-medium text-ink">{approval.approverName || approval.approverEmail}</p>
                    <p className="text-xs text-ink-muted">{approval.approverEmail}</p>
                    <p className={`text-xs mt-0.5 font-medium ${approval.status === "APPROVED" ? "text-green-700" : approval.status === "REJECTED" ? "text-red-700" : "text-amber-700"}`}>
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
              <DateRow label="Created"    value={request.createdAt} />
              <DateRow label="Submitted"  value={request.submittedAt} />
              <DateRow label="Needed By"  value={request.neededBy} />
              <DateRow label="Ordered"    value={request.orderedAt} />
              <DateRow label="Received"   value={request.receivedAt} />
              <DateRow label="Ready"      value={request.readyAt} />
              <DateRow label="Picked Up"  value={request.pickedUpAt} />
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
