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
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const navigation: NavGroup[] = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "/" },
      { label: "My Requests", href: "/requests" },
    ],
  },
  {
    section: "Submit",
    items: [
      { label: "New Request", href: "/requests/new" },
    ],
  },
  {
    section: "Admin",
    items: [
      { label: "Admin Queue", href: "/admin/queue", adminOnly: true },
      { label: "All Requests", href: "/admin/requests", adminOnly: true },
      { label: "Organizations", href: "/organizations", adminOnly: true },
      { label: "Import Data", href: "/import", adminOnly: true, orgLeadAllowed: true },
    ],
  },
  {
    section: "Finance",
    items: [
      { label: "Budgets", href: "/finance/budgets", financeOnly: true },
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
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-navy rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="14" rx="1" fill="none" stroke="white" strokeWidth="1.2"/>
              <rect x="5" y="1" width="6" height="3" rx="0.5" fill="white"/>
              <line x1="4" y1="7" x2="12" y2="7" stroke="white" strokeWidth="1" strokeLinecap="round"/>
              <line x1="4" y1="9.5" x2="12" y2="9.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
              <line x1="4" y1="12" x2="8" y2="12" stroke="white" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-bold text-ink text-base tracking-tight">Stamped</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navigation.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (item.adminOnly && !isAdmin && !(item.orgLeadAllowed && isOrgLead)) return false;
            if (item.financeOnly && !isFinance) return false;
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
