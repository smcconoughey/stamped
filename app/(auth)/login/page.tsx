"use client";

import { useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const azureAdEnabled = process.env.NEXT_PUBLIC_AZURE_AD_ENABLED === "true";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
    } else {
      const session = await getSession();
      if ((session?.user as any)?.role === "PLATFORM_ADMIN") {
        router.push("/platform");
      } else {
        router.push("/dashboard");
      }
    }
  }

  async function handleMicrosoftSignIn() {
    setSsoLoading(true);
    await signIn("azure-ad", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-navy rounded-xl mb-4">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="4" y="4" width="20" height="24" rx="2" fill="none" stroke="white" strokeWidth="1.5"/>
              <rect x="9" y="2" width="10" height="5" rx="1" fill="white"/>
              <line x1="8" y1="12" x2="20" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="16" x2="20" y2="16" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="20" x2="14" y2="20" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink">Stamped</h1>
          <p className="text-ink-secondary mt-1">Purchasing Management Portal</p>
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

        <p className="text-center text-xs text-ink-muted mt-6">
          FERPA-compliant purchasing management
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
