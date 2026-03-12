import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { StatusBadge } from "@/components/requests/status-badge";
import { Header } from "@/components/layout/header";
import { formatCurrency, formatDate, RequestStatus } from "@/lib/utils";
import { AISummaryBox } from "@/components/dashboard/ai-summary-box";

async function getDashboardStats(tenantId: string, userId: string, isAdmin: boolean) {
  const where = isAdmin
    ? { organization: { tenantId } }
    : { submittedById: userId, organization: { tenantId } };

  const [total, pending, active, readyForPickup, recentRequests] = await Promise.all([
    prisma.purchaseRequest.count({ where }),
    prisma.purchaseRequest.count({
      where: { ...where, status: { in: ["SUBMITTED", "PENDING_APPROVAL"] } },
    }),
    prisma.purchaseRequest.count({
      where: { ...where, status: { in: ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] } },
    }),
    prisma.purchaseRequest.count({
      where: { ...where, status: "READY_FOR_PICKUP" },
    }),
    prisma.purchaseRequest.findMany({
      where,
      include: {
        organization: { select: { name: true, code: true } },
        submittedBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
  ]);

  return { total, pending, active, readyForPickup, recentRequests };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);

  const { total, pending, active, readyForPickup, recentRequests } = await getDashboardStats(
    user.tenantId,
    user.id,
    isAdmin
  );

  const greeting = isAdmin ? "Admin Dashboard" : "My Purchasing Dashboard";
  const subtitle = isAdmin
    ? "Overview of all purchase requests across the college"
    : "Track and manage your purchase requests";

  return (
    <div>
      <Header
        title={greeting}
        subtitle={subtitle}
        actions={
          <Link href="/requests/new" className="btn-stamp">
            New Request
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Requests" value={total} href="/requests" />
          <StatCard
            label="Pending Approval"
            value={pending}
            href="/requests?status=SUBMITTED"
            highlight={pending > 0}
          />
          <StatCard label="Active Orders" value={active} href="/requests?status=ORDERED" />
          <StatCard
            label="Ready for Pickup"
            value={readyForPickup}
            href="/requests?status=READY_FOR_PICKUP"
            highlight={readyForPickup > 0}
            highlightColor="stamp"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Requests Table */}
          <div className="lg:col-span-2 card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Recent Requests</h2>
              <Link href="/requests" className="text-xs text-navy hover:underline">
                View all
              </Link>
            </div>
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
                    <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-sm">
                        No requests yet.{" "}
                        <Link href="/requests/new" className="text-navy hover:underline">
                          Submit your first request
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    recentRequests.map((req) => (
                      <tr
                        key={req.id}
                        className="hover:bg-paper transition-colors cursor-pointer"
                      >
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
                            className="text-ink hover:text-navy font-medium truncate block"
                          >
                            {req.title}
                          </Link>
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Summary / Quick Links */}
          <div className="space-y-4">
            {isAdmin && <AISummaryBox />}

            <div className="card p-5">
              <h3 className="text-sm font-semibold text-ink mb-3">Quick Actions</h3>
              <div className="space-y-1">
                <Link
                  href="/requests/new"
                  className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-paper text-sm text-ink-secondary hover:text-ink transition-colors"
                >
                  <span>Submit New Request</span>
                  <span className="text-ink-muted">&rarr;</span>
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin/queue"
                    className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-paper text-sm text-ink-secondary hover:text-ink transition-colors"
                  >
                    <span>Admin Queue</span>
                    <span className="text-ink-muted">&rarr;</span>
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    href="/import"
                    className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-paper text-sm text-ink-secondary hover:text-ink transition-colors"
                  >
                    <span>Import Data</span>
                    <span className="text-ink-muted">&rarr;</span>
                  </Link>
                )}
                <Link
                  href="/requests"
                  className="flex items-center justify-between px-3 py-2.5 rounded hover:bg-paper text-sm text-ink-secondary hover:text-ink transition-colors"
                >
                  <span>All Requests</span>
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

function StatCard({
  label,
  value,
  href,
  highlight = false,
  highlightColor = "navy",
}: {
  label: string;
  value: number;
  href: string;
  highlight?: boolean;
  highlightColor?: "navy" | "stamp";
}) {
  const colorClass =
    highlight && highlightColor === "stamp"
      ? "text-stamp"
      : highlight
      ? "text-navy"
      : "text-ink";

  return (
    <Link href={href} className="card p-5 block hover:shadow-card-hover transition-shadow">
      <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
    </Link>
  );
}
