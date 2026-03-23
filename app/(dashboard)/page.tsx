export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { StatusBadge } from "@/components/requests/status-badge";
import { Header } from "@/components/layout/header";
import { formatCurrency, formatDate, RequestStatus } from "@/lib/utils";
import { AISummaryBox } from "@/components/dashboard/ai-summary-box";

// ─── Admin dashboard data ───────────────────────────────────────────────────

async function getAdminDashboard(tenantId: string) {
  const where = { organization: { tenantId } };

  const [pipeline, recentRequests, orgCount, budgetTotals] = await Promise.all([
    // Count per status
    prisma.purchaseRequest.groupBy({
      by: ["status"],
      where: { ...where, status: { not: "CANCELLED" } },
      _count: { id: true },
    }),
    // Recent activity (updated recently)
    prisma.purchaseRequest.findMany({
      where: { ...where, status: { notIn: ["CANCELLED", "PICKED_UP"] } },
      include: {
        organization: { select: { name: true, code: true } },
        submittedBy: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.organization.count({ where: { tenantId, active: true } }),
    // Budget health
    prisma.budget.aggregate({
      where: { organization: { tenantId } },
      _sum: { allocated: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of pipeline) byStatus[row.status] = row._count.id;

  const needsAction = (byStatus["SUBMITTED"] ?? 0) + (byStatus["PENDING_APPROVAL"] ?? 0);
  const inFlight = (byStatus["APPROVED"] ?? 0) + (byStatus["ORDERED"] ?? 0) +
                   (byStatus["PARTIALLY_RECEIVED"] ?? 0) + (byStatus["RECEIVED"] ?? 0);
  const readyForPickup = byStatus["READY_FOR_PICKUP"] ?? 0;
  const totalActive = needsAction + inFlight + readyForPickup;

  return {
    byStatus, needsAction, inFlight, readyForPickup, totalActive,
    recentRequests, orgCount,
    totalAllocated: budgetTotals._sum.allocated ?? 0,
  };
}

// ─── Student dashboard data ─────────────────────────────────────────────────

async function getStudentDashboard(tenantId: string, userId: string) {
  const where = { submittedById: userId, organization: { tenantId } };
  const [total, pending, active, readyForPickup, recentRequests] = await Promise.all([
    prisma.purchaseRequest.count({ where }),
    prisma.purchaseRequest.count({ where: { ...where, status: { in: ["SUBMITTED", "PENDING_APPROVAL"] } } }),
    prisma.purchaseRequest.count({ where: { ...where, status: { in: ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] } } }),
    prisma.purchaseRequest.count({ where: { ...where, status: "READY_FOR_PICKUP" } }),
    prisma.purchaseRequest.findMany({
      where,
      include: {
        organization: { select: { name: true, code: true } },
        submittedBy: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
  ]);
  return { total, pending, active, readyForPickup, recentRequests };
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);

  if (isAdmin) {
    const data = await getAdminDashboard(user.tenantId);
    return <AdminDashboard data={data} />;
  }

  const data = await getStudentDashboard(user.tenantId, user.id);
  return <StudentDashboard data={data} userName={user.name} />;
}

// ─── Admin dashboard ─────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { status: "SUBMITTED",        label: "Submitted",    color: "bg-blue-400",    text: "text-blue-700" },
  { status: "PENDING_APPROVAL", label: "Pending Appr", color: "bg-yellow-400",  text: "text-yellow-700" },
  { status: "APPROVED",         label: "Approved",     color: "bg-emerald-500", text: "text-emerald-700" },
  { status: "ORDERED",          label: "Ordered",      color: "bg-indigo-500",  text: "text-indigo-700" },
  { status: "RECEIVED",         label: "Received",     color: "bg-teal-500",    text: "text-teal-700" },
  { status: "READY_FOR_PICKUP", label: "Ready",        color: "bg-purple-500",  text: "text-purple-700" },
];

function AdminDashboard({ data }: { data: Awaited<ReturnType<typeof getAdminDashboard>> }) {
  const { byStatus, needsAction, inFlight, readyForPickup, totalActive, recentRequests, orgCount, totalAllocated } = data;

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Operations overview across all organizations"
        actions={
          <Link href="/admin/queue" className="btn-stamp">
            Open Queue
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Top stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            label="Needs Action"
            value={needsAction}
            href="/admin/queue?filter=needs-action"
            highlight={needsAction > 0}
            sub="Submitted + pending approval"
          />
          <AdminStatCard
            label="In Flight"
            value={inFlight}
            href="/admin/queue"
            sub="Approved through received"
          />
          <AdminStatCard
            label="Ready for Pickup"
            value={readyForPickup}
            href="/admin/queue"
            highlight={readyForPickup > 0}
            highlightColor="stamp"
            sub="Waiting on students"
          />
          <AdminStatCard
            label="Active Total"
            value={totalActive}
            href="/requests"
            sub={`Across ${orgCount} organizations`}
          />
        </div>

        {/* Pipeline funnel */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Pipeline</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {PIPELINE_STAGES.map(stage => {
              const count = byStatus[stage.status] ?? 0;
              return (
                <Link key={stage.status} href="/admin/queue"
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:border-navy hover:shadow-sm transition-all text-center">
                  <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                  <span className={`text-2xl font-bold ${count > 0 ? stage.text : "text-ink-muted"}`}>{count}</span>
                  <span className="text-[10px] text-ink-muted uppercase tracking-wide leading-tight">{stage.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent active requests */}
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Active Requests</h2>
              <Link href="/requests" className="text-xs text-navy hover:underline">View all</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-paper/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Number</th>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Title</th>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">Org</th>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Status</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-sm">No active requests.</td>
                    </tr>
                  ) : recentRequests.map(req => (
                    <tr key={req.id} className="hover:bg-paper transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/requests/${req.id}`} className="font-mono text-xs text-navy hover:underline">{req.number}</Link>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <Link href={`/requests/${req.id}`} className="text-ink hover:text-navy font-medium truncate block">{req.title}</Link>
                        <span className="text-xs text-ink-muted">{req.submittedBy?.name}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-ink-secondary text-xs">{req.organization.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.status as RequestStatus} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-xs text-ink-muted">{formatDate(req.updatedAt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar: AI + quick links */}
          <div className="space-y-4">
            <AISummaryBox />

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-ink mb-3">Quick Links</h3>
              <div className="space-y-1">
                {[
                  { href: "/admin/queue", label: "Admin Queue", badge: needsAction > 0 ? `${needsAction} need action` : undefined },
                  { href: "/requests", label: "All Requests" },
                  { href: "/organizations", label: "Organizations" },
                  { href: "/finance/budgets", label: "Finance & Budgets" },
                  { href: "/import", label: "Import Data" },
                ].map(link => (
                  <Link key={link.href} href={link.href}
                    className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-paper text-sm text-ink-secondary hover:text-ink transition-colors">
                    <span>{link.label}</span>
                    {link.badge
                      ? <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">{link.badge}</span>
                      : <span className="text-ink-muted">&rarr;</span>
                    }
                  </Link>
                ))}
              </div>
            </div>

            {totalAllocated > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-ink mb-1">Total Allocated</h3>
                <p className="text-2xl font-bold text-ink">{formatCurrency(totalAllocated)}</p>
                <p className="text-xs text-ink-muted mt-1">Across all org budgets</p>
                <Link href="/organizations" className="text-xs text-navy hover:underline mt-2 block">View breakdown →</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminStatCard({
  label, value, href, highlight = false, highlightColor = "navy", sub,
}: {
  label: string; value: number; href: string; highlight?: boolean;
  highlightColor?: "navy" | "stamp"; sub?: string;
}) {
  const colorClass = highlight && highlightColor === "stamp" ? "text-stamp"
    : highlight ? "text-navy" : "text-ink";
  return (
    <Link href={href} className="card p-5 block hover:shadow-card-hover transition-shadow">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-ink-muted mt-1">{sub}</p>}
    </Link>
  );
}

// ─── Student dashboard ────────────────────────────────────────────────────────

function StudentDashboard({
  data, userName,
}: {
  data: Awaited<ReturnType<typeof getStudentDashboard>>;
  userName?: string;
}) {
  const { total, pending, active, readyForPickup, recentRequests } = data;
  const greeting = userName ? `Hey, ${userName.split(" ")[0]}` : "My Dashboard";

  return (
    <div>
      <Header
        title={greeting}
        subtitle="Track and manage your purchase requests"
        actions={
          <Link href="/requests/new" className="btn-stamp">New Request</Link>
        }
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StudentStatCard label="Total Requests" value={total} href="/requests" />
          <StudentStatCard label="Pending Approval" value={pending} href="/requests" highlight={pending > 0} />
          <StudentStatCard label="Active Orders" value={active} href="/requests" />
          <StudentStatCard label="Ready for Pickup" value={readyForPickup} href="/requests"
            highlight={readyForPickup > 0} highlightColor="stamp" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Recent Requests</h2>
              <Link href="/requests" className="text-xs text-navy hover:underline">View all</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-paper/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Number</th>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Title</th>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">Org</th>
                    <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">Status</th>
                    <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-sm">
                        No requests yet.{" "}
                        <Link href="/requests/new" className="text-navy hover:underline">Submit your first request</Link>
                      </td>
                    </tr>
                  ) : recentRequests.map(req => (
                    <tr key={req.id} className="hover:bg-paper transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/requests/${req.id}`} className="font-mono text-xs text-navy hover:underline">{req.number}</Link>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <Link href={`/requests/${req.id}`} className="text-ink hover:text-navy font-medium truncate block">{req.title}</Link>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-ink-secondary text-xs">{req.organization.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={req.status as RequestStatus} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-xs text-ink-muted">{formatDate(req.updatedAt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-ink mb-3">Quick Actions</h3>
              <div className="space-y-1">
                <Link href="/requests/new"
                  className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-paper text-sm text-ink-secondary hover:text-ink transition-colors">
                  <span>Submit New Request</span>
                  <span className="text-ink-muted">&rarr;</span>
                </Link>
                <Link href="/requests"
                  className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-paper text-sm text-ink-secondary hover:text-ink transition-colors">
                  <span>My Requests</span>
                  <span className="text-ink-muted">&rarr;</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentStatCard({
  label, value, href, highlight = false, highlightColor = "navy",
}: {
  label: string; value: number; href: string; highlight?: boolean; highlightColor?: "navy" | "stamp";
}) {
  const colorClass = highlight && highlightColor === "stamp" ? "text-stamp"
    : highlight ? "text-navy" : "text-ink";
  return (
    <Link href={href} className="card p-5 block hover:shadow-card-hover transition-shadow">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
    </Link>
  );
}
