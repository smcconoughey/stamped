export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export default async function OrganizationsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);

  if (!isAdmin) {
    redirect("/");
  }

  const organizations = await prisma.organization.findMany({
    where: { tenantId: user.tenantId },
    include: {
      budgets: {
        orderBy: { fiscalYear: "desc" },
        take: 1,
      },
      _count: {
        select: { requests: true, members: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <Header
        title="Organizations"
        subtitle="Student organizations and their budget status"
      />

      <div className="p-6">
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-paper/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Organization
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Code
                  </th>
                  <th className="px-4 py-2.5 text-left text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">
                    Fiscal Year
                  </th>
                  <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Allocated
                  </th>
                  <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Spent
                  </th>
                  <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">
                    Reserved
                  </th>
                  <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted">
                    Available
                  </th>
                  <th className="px-4 py-2.5 text-right text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden lg:table-cell">
                    Requests
                  </th>
                  <th className="px-4 py-2.5 text-center text-2xs font-semibold tracking-widest uppercase text-ink-muted hidden md:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {organizations.map((org) => {
                  const budget = org.budgets[0];
                  const available = budget
                    ? budget.allocated - budget.spent - budget.reserved
                    : null;
                  const usedPct = budget
                    ? Math.min(100, ((budget.spent + budget.reserved) / budget.allocated) * 100)
                    : 0;

                  return (
                    <tr key={org.id} className="hover:bg-paper transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/organizations/${org.id}`} className="font-medium text-ink hover:text-navy">{org.name}</Link>
                        {org.department && (
                          <p className="text-xs text-ink-muted">{org.department}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs bg-paper border border-border rounded px-1.5 py-0.5 text-ink-secondary">
                          {org.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-ink-secondary">{budget?.fiscalYear || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-ink">
                          {budget ? formatCurrency(budget.allocated) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-ink-secondary">
                          {budget ? formatCurrency(budget.spent) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-sm text-ink-secondary">
                          {budget ? formatCurrency(budget.reserved) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold ${
                          available != null && available < 0
                            ? "text-red-600"
                            : available != null && available < 500
                            ? "text-amber-700"
                            : "text-green-700"
                        }`}>
                          {available != null ? formatCurrency(available) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <span className="text-sm text-ink-secondary">{org._count.requests}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                usedPct >= 90 ? "bg-red-500" : usedPct >= 70 ? "bg-amber-500" : "bg-green-500"
                              }`}
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                          <span className="text-2xs text-ink-muted">{Math.round(usedPct)}% used</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
