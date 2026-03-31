"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Org = { id: string; name: string; code: string; department: string | null };

type Step = "role" | "org" | "new-org" | "staff-welcome";

export default function OnboardPage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();
  const user = session?.user as any;

  const [step, setStep] = useState<Step>("role");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedRole, setSelectedRole] = useState<"STUDENT" | "ORG_LEAD" | "">("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [newOrg, setNewOrg] = useState({ name: "", code: "", department: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isStudent = !user?.role || user.role === "STUDENT";

  useEffect(() => {
    if (status === "authenticated") {
      // Staff roles go straight to a welcome step
      if (!isStudent) setStep("staff-welcome");
    }
  }, [status, isStudent]);

  async function fetchOrgs() {
    const res = await fetch("/api/onboard");
    const data = await res.json();
    setOrgs(data.orgs || []);
  }

  function handleRoleSelect(role: "STUDENT" | "ORG_LEAD") {
    setSelectedRole(role);
    if (role === "STUDENT") {
      submit({ role: "STUDENT" });
    } else {
      fetchOrgs();
      setStep("org");
    }
  }

  async function submit(payload: {
    role: string;
    orgId?: string;
    orgName?: string;
    orgCode?: string;
    orgDepartment?: string;
  }) {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.push("/dashboard");
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
          <h1 className="text-2xl font-bold text-ink">Welcome to Stamped</h1>
          <p className="text-ink-secondary mt-1">Let's get your account set up</p>
        </div>

        <div className="bg-white border border-border rounded-lg shadow-card p-8">
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">{error}</div>
          )}

          {/* ── Role selection (students) ── */}
          {step === "role" && (
            <div>
              <h2 className="text-lg font-semibold text-ink mb-2">What's your role?</h2>
              <p className="text-sm text-ink-secondary mb-6">
                This determines what you can do in Stamped.
              </p>
              <div className="space-y-3">
                <RoleCard
                  title="Student"
                  description="Submit purchase requests for your organization and track their status."
                  onClick={() => handleRoleSelect("STUDENT")}
                  disabled={submitting}
                />
                <RoleCard
                  title="Student Lead / Treasurer"
                  description="Manage an organization's requests, budgets, and submit on behalf of members."
                  onClick={() => handleRoleSelect("ORG_LEAD")}
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {/* ── Org selection (student leads) ── */}
          {step === "org" && (
            <div>
              <button onClick={() => setStep("role")} className="text-xs text-ink-muted hover:text-ink mb-4 flex items-center gap-1">
                ← Back
              </button>
              <h2 className="text-lg font-semibold text-ink mb-2">Which organization?</h2>
              <p className="text-sm text-ink-secondary mb-5">Select your org or create a new one.</p>

              {orgs.length > 0 && (
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
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
                      <div className="font-medium text-ink text-sm">{org.name}</div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        {org.code}{org.department ? ` · ${org.department}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedOrgId && (
                <button
                  onClick={() => submit({ role: "ORG_LEAD", orgId: selectedOrgId })}
                  disabled={submitting}
                  className="w-full py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60 mb-3"
                >
                  {submitting ? "Setting up..." : "Join as Lead"}
                </button>
              )}

              <button
                onClick={() => setStep("new-org")}
                className="w-full py-2.5 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper transition-colors"
              >
                + Create a new organization
              </button>
            </div>
          )}

          {/* ── New org form ── */}
          {step === "new-org" && (
            <div>
              <button onClick={() => setStep("org")} className="text-xs text-ink-muted hover:text-ink mb-4 flex items-center gap-1">
                ← Back
              </button>
              <h2 className="text-lg font-semibold text-ink mb-2">Create your organization</h2>
              <p className="text-sm text-ink-secondary mb-5">
                You'll be set as the lead. Admins can adjust details later.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Organization name <span className="text-stamp">*</span></label>
                  <input
                    className={inputCls}
                    value={newOrg.name}
                    onChange={e => setNewOrg(f => ({ ...f, name: e.target.value }))}
                    placeholder="Robotics Club"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Short code <span className="text-stamp">*</span></label>
                  <input
                    className={inputCls}
                    value={newOrg.code}
                    onChange={e => setNewOrg(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="ROBO"
                    maxLength={10}
                  />
                  <p className="text-xs text-ink-muted mt-1">Used on request numbers, e.g. ROBO-001</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Department / college</label>
                  <input
                    className={inputCls}
                    value={newOrg.department}
                    onChange={e => setNewOrg(f => ({ ...f, department: e.target.value }))}
                    placeholder="College of Engineering"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!newOrg.name || !newOrg.code) { setError("Name and code are required."); return; }
                    submit({ role: "ORG_LEAD", orgName: newOrg.name, orgCode: newOrg.code, orgDepartment: newOrg.department });
                  }}
                  disabled={submitting}
                  className="w-full py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create & Continue"}
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
              <h2 className="text-lg font-semibold text-ink mb-2">You're all set</h2>
              <p className="text-sm text-ink-secondary mb-6">
                Your account has been set up with staff access. You can manage purchase requests, organizations, and budgets.
              </p>
              <button
                onClick={() => submit({ role: user?.role || "ADMIN_STAFF" })}
                disabled={submitting}
                className="w-full py-2.5 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60"
              >
                {submitting ? "Loading..." : "Go to Dashboard"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleCard({
  title,
  description,
  onClick,
  disabled,
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-5 py-4 rounded-lg border border-border hover:border-navy hover:bg-navy/5 transition-colors disabled:opacity-60 group"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-ink text-sm group-hover:text-navy transition-colors">{title}</div>
          <div className="text-xs text-ink-muted mt-1">{description}</div>
        </div>
        <svg className="w-4 h-4 text-ink-muted group-hover:text-navy ml-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

const inputCls = "w-full px-3 py-2 border border-border rounded-md text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy";
