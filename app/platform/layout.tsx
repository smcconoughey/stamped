import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== "PLATFORM_ADMIN") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink border-b border-ink-secondary/20 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-stamp rounded flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
              <rect x="4" y="4" width="20" height="24" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
              <rect x="9" y="2" width="10" height="5" rx="1" fill="white"/>
              <line x1="8" y1="12" x2="20" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-white font-bold text-sm">Stamped</span>
          <span className="text-ink-secondary text-sm">/ Platform Admin</span>
        </div>
        <nav className="flex items-center gap-1 ml-4">
          <a href="/platform/tenants" className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors">
            Tenants
          </a>
        </nav>
        <div className="ml-auto">
          <a href="/api/auth/signout" className="text-xs text-white/50 hover:text-white transition-colors">
            Sign out
          </a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">{children}</main>
    </div>
  );
}
