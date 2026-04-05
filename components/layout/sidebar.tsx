"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  adminOnly?: boolean;
  financeOnly?: boolean;
  orgLeadAllowed?: boolean;
  orgLeadOnly?: boolean;
  nonAdminOnly?: boolean;
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "My Requests", href: "/requests", nonAdminOnly: true },
      { label: "New Request", href: "/requests/new", nonAdminOnly: true },
    ],
  },
  {
    section: "My Organization",
    items: [
      { label: "Import Budget Sheet", href: "/import", orgLeadOnly: true },
      { label: "Members", href: "/import?tab=members", orgLeadOnly: true },
    ],
  },
  {
    section: "Admin",
    items: [
      { label: "Admin Queue", href: "/admin/queue", adminOnly: true },
      { label: "All Requests", href: "/requests", adminOnly: true },
      { label: "Organizations", href: "/organizations", adminOnly: true },
      { label: "Import Data", href: "/import", adminOnly: true },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Budgets", href: "/finance/budgets", orgLeadAllowed: true },
      { label: "Reports", href: "/finance/reports", financeOnly: true },
    ],
  },
];

function SidebarLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn("sidebar-link", active && "sidebar-link-active")}
    >
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(role);
  const isFinance = ["FINANCE_ADMIN", "SUPER_ADMIN"].includes(role);
  const isOrgLead = role === "ORG_LEAD";

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-screen bg-white border-r border-border">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-border">
        <img src="/fulllogo.png" alt="Stamped" className="h-14 w-auto object-contain" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navigation.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && !isAdmin) return false;
            if (item.nonAdminOnly && isAdmin) return false;
            if (item.financeOnly && !isFinance) return false;
            if (item.orgLeadOnly && !isOrgLead) return false;
            if (item.orgLeadAllowed && !isAdmin && !isFinance && !isOrgLead) return false;
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.section}>
              <div className="section-header">{group.section}</div>
              {visibleItems.map((item) => (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-3">
        <div className="px-2 py-1.5 mb-1">
          <p className="text-sm font-medium text-ink truncate">{session?.user?.name || session?.user?.email}</p>
          <p className="text-xs text-ink-muted truncate">{session?.user?.email}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-left sidebar-link text-ink-muted hover:text-red-700"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
