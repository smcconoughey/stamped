import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LandingPage } from "@/components/landing/landing-page";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  // Authenticated users go straight to their dashboard
  if (session) {
    const role = (session.user as any)?.role;
    if (role === "PLATFORM_ADMIN") redirect("/platform");
    redirect("/dashboard");
  }

  return <LandingPage />;
}
