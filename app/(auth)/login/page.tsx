"use client";

import { useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { DemoBanner } from "@/components/demo-banner";

const azureAdEnabled = process.env.NEXT_PUBLIC_AZURE_AD_ENABLED === "true";

function isDemoMode() {
  return document.cookie.split("; ").some((c) => c === "stamped-demo=true");
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const demo = typeof window !== "undefined" && isDemoMode();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      demo: demo ? "true" : undefined,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
    } else {
      const session = await getSession();
      if ((session?.user as any)?.role === "PLATFORM_ADMIN") {
        router.push("/platform/tenants");
      } else {
        router.push("/");
      }
    }
  }

  async function handleMicrosoftSignIn() {
    setSsoLoading(true);
    await signIn("azure-ad", { callbackUrl: "/" });
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex justify-center mb-8">
          <Image src="/fulllogo.png" alt="Stamped" width={200} height={67} style={{ objectFit: "contain" }} priority />
        </div>

        <div className="bg-white border border-border rounded-lg shadow-card p-8">
          <h2 className="text-lg font-semibold text-ink mb-6">Sign in to your account</h2>

          {(error || callbackError) && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {error || (
                callbackError === "OAuthAccountNotLinked"
                  ? "This email is already registered. Use email/password to sign in."
                  : callbackError === "AccessDenied"
                  ? "Your institution hasn't been set up in Stamped yet. Contact your purchasing administrator."
                  : "Sign in failed. Please try again."
              )}
            </div>
          )}

          {/* Microsoft SSO — shown when Azure AD is configured */}
          {azureAdEnabled && (
            <>
              <button
                onClick={handleMicrosoftSignIn}
                disabled={ssoLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-border rounded-md bg-white hover:bg-paper text-sm font-medium text-ink transition-colors disabled:opacity-60"
              >
                {/* Microsoft logo */}
                <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                {ssoLoading ? "Redirecting..." : "Sign in with Microsoft"}
              </button>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"/>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-ink-muted">or sign in with email</span>
                </div>
              </div>
            </>
          )}

          {/* Demo quick-login — shown when demo cookie is set */}
          {demo && (
            <>
              <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm font-medium text-amber-800 mb-2">Demo Mode Active</p>
                <p className="text-xs text-amber-700 mb-3">Sign in with any email and password to test the setup flow. Nothing will be saved.</p>
                <button
                  onClick={async () => {
                    setDemoLoading(true);
                    setError("");
                    const result = await signIn("credentials", {
                      email: "demo@example.edu",
                      password: "demo",
                      demo: "true",
                      redirect: false,
                    });
                    if (result?.error) {
                      setError("Demo login failed.");
                      setDemoLoading(false);
                    } else {
                      router.push("/onboard");
                    }
                  }}
                  disabled={demoLoading}
                  className="w-full flex items-center justify-center px-4 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-md hover:bg-amber-700 transition-colors disabled:opacity-60"
                >
                  {demoLoading ? "Signing in..." : "Quick Demo Sign In"}
                </button>
              </div>

              <div className="relative mb-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"/>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-ink-muted">or sign in with real credentials</span>
                </div>
              </div>
            </>
          )}

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                placeholder="you@university.edu"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                placeholder="Password"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light transition-colors disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <DemoBanner />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
