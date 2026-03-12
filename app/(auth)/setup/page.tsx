"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantDomain, setTenantDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (!d.needsSetup) router.replace("/login");
        else setChecking(false);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, tenantName, tenantDomain }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Setup failed.");
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  if (checking) return null;

  if (done) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-border rounded-lg shadow-card p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#1A6B3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ink">Setup complete</h1>
          <p className="text-sm text-ink-secondary">
            Admin account created for <strong>{email}</strong>.<br/>
            Sign in with any password — password authentication will be configured separately.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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
          <p className="text-ink-secondary mt-1">Initial Setup</p>
        </div>

        <div className="bg-white border border-border rounded-lg shadow-card p-8">
          <h2 className="text-lg font-semibold text-ink mb-1">Create your admin account</h2>
          <p className="text-sm text-ink-secondary mb-6">This page is only shown once, when the database is empty.</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Your email <span className="text-stamp">*</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                placeholder="admin@university.edu"
                required
              />
            </div>
            <hr className="border-border" />
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Institution name <span className="text-stamp">*</span></label>
              <input
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                placeholder="College of Engineering"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Email domain <span className="text-stamp">*</span></label>
              <input
                type="text"
                value={tenantDomain}
                onChange={(e) => setTenantDomain(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy"
                placeholder="university.edu"
                required
              />
              <p className="mt-1 text-xs text-ink-muted">Used to match Microsoft SSO logins to this institution.</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center px-4 py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light transition-colors disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Admin Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
