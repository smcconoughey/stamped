import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userCount = await prisma.user.count();
  if (userCount === 0) redirect("/setup");

  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user as any).role === "PLATFORM_ADMIN") redirect("/platform/tenants");

  const userId = (session.user as any).id;
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { onboarded: true } });
  if (!dbUser?.onboarded) redirect("/onboard");

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
