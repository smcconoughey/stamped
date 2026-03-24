"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Org = { id: string; name: string; code: string; department: string | null };
type Step = "org" | "new-org" | "staff-welcome";

export default function OnboardPage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();
  const user = session?.user as any;

  const isStudent = !user?.role || user.role === "STUDENT" || user.role === "ORG_LEAD";

  const [step, setStep] = useState<Step>("org");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [newOrg, setNewOrg] = useState({
    name: "", code: "", department: "",
    advisorName: "", advisorEmail: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!isStudent) {
      setStep("staff-welcome");
    } else {
      fetch("/api/onboard").then(r => r.json()).then(d => {
        setOrgs(d.orgs || []);
        setOrgsLoaded(true);
      });
    }
  }, [status, isStudent]);

  async function submit(payload: {
    role: string;
    orgId?: string;
    orgName?: string;
    orgCode?: string;
    orgDepartment?: string;
    orgAdvisorName?: string;
    orgAdvisorEmail?: string;
  }) {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.push("/");
    } else {
      const d = await res.json();
      setError(d.error || "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <div className="min-h-screen bg-paper flex items-center justify-center text-ink-muted text-sm">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/fulllogo.png" alt="Stamped" width={180} height={60} style={{ objectFit: "contain" }} priority />
        </div>

        <div className="bg-white border border-border rounded-lg shadow-card p-8">
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>
          )}

          {/* ── Org selection (students / leads) ── */}
          {step === "org" && (
            <div>
              <h2 className="text-xl font-bold text-ink mb-1">Set up your organization</h2>
              <p className="text-sm text-ink-secondary mb-6">
                Select your existing organization or create a new one. You'll be set as the lead.
              </p>

              {!orgsLoaded ? (
                <p className="text-sm text-ink-muted">Loading organizations…</p>
              ) : (
                <>
                  {orgs.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Join an existing org</p>
                      <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1">
                        {orgs.map(org => (
                          <button
                            key={org.id}
                            onClick={() => setSelectedOrgId(org.id)}
                            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                              selectedOrgId === org.id
                                ? "border-navy bg-navy/5"
                                : "border-border hover:border-navy/40 hover:bg-paper"
                            }`}
                          >
                            <div className="font-semibold text-ink text-sm">{org.name}</div>
                            <div className="text-xs text-ink-muted mt-0.5">
                              {org.code}{org.department ? ` · ${org.department}` : ""}
                            </div>
                          </button>
                        ))}
                      </div>

                      {selectedOrgId && (
                        <button
                          onClick={() => submit({ role: "ORG_LEAD", orgId: selectedOrgId })}
                          disabled={submitting}
                          className="w-full py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60 mb-4"
                        >
                          {submitting ? "Setting up…" : "Join as Lead"}
                        </button>
                      )}

                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-white px-3 text-ink-muted">or</span>
                        </div>
                      </div>
                    </>
                  )}

                  <button
                    onClick={() => setStep("new-org")}
                    className="w-full py-2.5 border-2 border-navy/30 rounded-md text-sm font-semibold text-navy hover:bg-navy/5 transition-colors"
                  >
                    + Create a new organization
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── New org form ── */}
          {step === "new-org" && (
            <div>
              <button onClick={() => setStep("org")} className="text-xs text-ink-muted hover:text-ink mb-5 flex items-center gap-1">
                ← Back
              </button>
              <h2 className="text-xl font-bold text-ink mb-1">Create your organization</h2>
              <p className="text-sm text-ink-secondary mb-6">
                Fill in your org details below. You'll be set as the lead — admins can adjust later.
              </p>

              <div className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-ink mb-1">
                    Full organization name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputCls}
                    value={newOrg.name}
                    onChange={e => setNewOrg(f => ({ ...f, name: e.target.value }))}
                    placeholder="Experimental Rocket Propulsion Lab"
                  />
                  <p className="text-xs text-ink-muted mt-1">The complete, official name of your organization.</p>
                </div>

                {/* Code */}
                <div>
                  <label className="block text-sm font-semibold text-ink mb-1">
                    Acronym / short code <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputCls}
                    value={newOrg.code}
                    onChange={e => setNewOrg(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="ERPL"
                    maxLength={10}
                  />
                  <p className="text-xs text-ink-muted mt-1">
                    A short abbreviation — <strong>different from the full name above</strong>. Used on request numbers, e.g. <span className="font-mono">ERPL-2026-001</span>. Typically 2–6 capital letters.
                  </p>
                </div>

                {/* Department */}
                <div>
                  <label className="block text-sm font-semibold text-ink mb-1">Department / college</label>
                  <input
                    className={inputCls}
                    value={newOrg.department}
                    onChange={e => setNewOrg(f => ({ ...f, department: e.target.value }))}
                    placeholder="College of Engineering"
                  />
                </div>

                {/* Advisor section */}
                <div className="pt-1 border-t border-border">
                  <p className="text-sm font-semibold text-ink mb-0.5">Faculty advisor</p>
                  <p className="text-xs text-ink-muted mb-3">
                    Your advisor's contact info is used for purchase approval emails. You can add this now or later from the organization page.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1">Advisor name</label>
                      <input
                        className={inputCls}
                        value={newOrg.advisorName}
                        onChange={e => setNewOrg(f => ({ ...f, advisorName: e.target.value }))}
                        placeholder="Dr. Jane Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink mb-1">Advisor email</label>
                      <input
                        type="email"
                        className={inputCls}
                        value={newOrg.advisorEmail}
                        onChange={e => setNewOrg(f => ({ ...f, advisorEmail: e.target.value }))}
                        placeholder="jsmith@university.edu"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!newOrg.name.trim()) { setError("Organization name is required."); return; }
                    if (!newOrg.code.trim()) { setError("Acronym is required."); return; }
                    setError("");
                    submit({
                      role: "ORG_LEAD",
                      orgName: newOrg.name,
                      orgCode: newOrg.code,
                      orgDepartment: newOrg.department,
                      orgAdvisorName: newOrg.advisorName,
                      orgAdvisorEmail: newOrg.advisorEmail,
                    });
                  }}
                  disabled={submitting}
                  className="w-full py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60"
                >
                  {submitting ? "Creating…" : "Create & Continue"}
                </button>
              </div>
            </div>
          )}

          {/* ── Staff welcome ── */}
          {step === "staff-welcome" && (
            <div className="text-center">
              <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-ink mb-2">You're all set</h2>
              <p className="text-sm text-ink-secondary mb-6">
                Your account has been set up with staff access. You can manage purchase requests, organizations, and budgets.
              </p>
              <button
                onClick={() => submit({ role: user?.role || "ADMIN_STAFF" })}
                disabled={submitting}
                className="w-full py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60"
              >
                {submitting ? "Loading…" : "Go to Dashboard"}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-muted mt-6">FERPA-compliant purchasing management</p>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy";
