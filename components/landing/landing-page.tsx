"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

/* ─── Inline SVG Icons ─────────────────────────────────────────────────────── */

function ClipboardLogo({ size = 20, color = "white" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="20" height="24" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
      <rect x="9" y="2" width="10" height="5" rx="1" fill={color} />
      <line x1="8" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="16" x2="20" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="20" x2="14" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Constants ────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    title: "AI Approval Parsing",
    desc: "Claude AI reads advisor email replies and auto-categorizes approvals, rejections, and follow-up questions. No manual sorting required.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" fill="white" opacity="0.3" />
      </svg>
    ),
  },
  {
    title: "One-Click Stamping",
    desc: "Admins advance requests through the pipeline with a single click. Stamp to approve, order, receive, and release — with satisfying visual feedback.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="8" width="18" height="12" rx="2" stroke="white" strokeWidth="1.5" />
        <path d="M8 8V6C8 4.34 9.34 3 11 3H13C14.66 3 16 4.34 16 6V8" stroke="white" strokeWidth="1.5" />
        <circle cx="12" cy="15" r="2" fill="white" />
      </svg>
    ),
  },
  {
    title: "Budget Tracking",
    desc: "Real-time budget balances per organization and fiscal year. See allocated, spent, and reserved funds before approving any request.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.5" />
        <path d="M12 7V12L15 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Multi-Tenant",
    desc: "Each university gets its own isolated workspace with custom settings, budgets, and users. One platform, many institutions.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="white" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: "Audit Trail",
    desc: "Every status change, approval decision, and admin action is logged with timestamps and user attribution. Full compliance visibility.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="white" strokeWidth="1.5" />
        <path d="M14 2V8H20" stroke="white" strokeWidth="1.5" />
        <line x1="8" y1="13" x2="16" y2="13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="17" x2="12" y2="17" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Bulk Import",
    desc: "Import existing requests from spreadsheets with AI-powered column mapping. Migrate your data without manual re-entry.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        <polyline points="7,10 12,15 17,10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="15" x2="12" y2="3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const PIPELINE_STEPS = [
  { label: "Draft", desc: "Student creates request", color: "#9C9890" },
  { label: "Submitted", desc: "Sent for review", color: "#2563EB" },
  { label: "Pending", desc: "Awaiting advisor", color: "#B45309" },
  { label: "Approved", desc: "Advisor says yes", color: "#1A6B3C" },
  { label: "Ordered", desc: "Purchase placed", color: "#6D28D9" },
  { label: "Received", desc: "Item arrives on campus", color: "#0E7490" },
  { label: "Ready", desc: "Available for pickup", color: "#047857" },
  { label: "Picked Up", desc: "Complete!", color: "#6B6760" },
];

const ROLES = [
  {
    title: "Student",
    subtitle: "Request submitter",
    color: "#2563EB",
    items: [
      "Submit purchase requests with items, vendors, and justification",
      "Track request status in real time",
      "View spending history for your organization",
      "Get notified when items are ready for pickup",
    ],
  },
  {
    title: "Org Lead",
    subtitle: "Club treasurer or president",
    color: "#B45309",
    items: [
      "View and manage all requests in your organization",
      "Monitor organization budget and remaining funds",
      "Approve or coordinate with your faculty advisor",
      "Add and manage organization members",
    ],
  },
  {
    title: "Admin Staff",
    subtitle: "Purchasing office",
    color: "#1A6B3C",
    items: [
      "Process the admin queue — stamp requests forward",
      "Send approval emails to faculty advisors",
      "Track stale requests and pipeline dollar values",
      "Bulk import requests from spreadsheets",
    ],
  },
  {
    title: "Finance Admin",
    subtitle: "Budget management",
    color: "#6D28D9",
    items: [
      "Allocate budgets per organization and fiscal year",
      "View real-time spending and reserved funds",
      "Generate financial reports and summaries",
      "All admin staff capabilities included",
    ],
  },
  {
    title: "Super Admin",
    subtitle: "System administrator",
    color: "#1B3A6B",
    items: [
      "Configure tenant settings and email integration",
      "Manage users, roles, and permissions",
      "Access full audit logs and system health",
      "Set up Azure AD SSO and Microsoft Graph",
    ],
  },
];

const TECH_PILLS = [
  "Next.js 14", "React 18", "TypeScript", "Prisma", "PostgreSQL",
  "Claude AI", "Azure AD SSO", "NextAuth.js", "Tailwind CSS",
];

/* ─── Component ────────────────────────────────────────────────────────────── */

export function LandingPage() {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      document.querySelectorAll(".landing-animate").forEach((el) => {
        el.classList.add("landing-visible");
      });
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("landing-visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll(".landing-animate").forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <>
      <style jsx global>{`
        .landing-root {
          --l-navy: #1B3A6B;
          --l-navy-light: #234D8F;
          --l-navy-dark: #122549;
          --l-stamp: #C2400C;
          --l-stamp-light: #D4531F;
          --l-paper: #F7F6F3;
          --l-card: #FFFFFF;
          --l-border: #E4E1D9;
          --l-ink: #1A1916;
          --l-ink-secondary: #6B6760;
          --l-ink-muted: #9C9890;
          --l-shadow-card: 0 1px 3px 0 rgba(26,25,22,0.08), 0 1px 2px -1px rgba(26,25,22,0.06);
          --l-shadow-hover: 0 4px 6px -1px rgba(26,25,22,0.08), 0 2px 4px -2px rgba(26,25,22,0.06);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: var(--l-ink);
        }

        @keyframes landingFadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .landing-hero-anim {
          animation: landingFadeInUp 0.7s ease-out both;
        }
        .landing-hero-anim:nth-child(2) { animation-delay: 0.1s; }
        .landing-hero-anim:nth-child(3) { animation-delay: 0.2s; }
        .landing-hero-anim:nth-child(4) { animation-delay: 0.3s; }

        .landing-animate {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .landing-visible {
          opacity: 1;
          transform: translateY(0);
        }

        @media (prefers-reduced-motion: reduce) {
          .landing-hero-anim { animation: none !important; opacity: 1; transform: none; }
          .landing-animate { opacity: 1; transform: none; transition: none; }
        }
      `}</style>

      <div className="landing-root">
        {/* ── Nav ── */}
        <Nav />

        <main>
          {/* ── Hero ── */}
          <section
            className="relative overflow-hidden"
            style={{
              padding: "10rem 0 8rem",
              background: "linear-gradient(135deg, var(--l-navy) 0%, var(--l-navy-dark) 100%)",
              clipPath: "polygon(0 0, 100% 0, 100% 88%, 0 100%)",
            }}
          >
            <div
              className="absolute pointer-events-none select-none"
              style={{
                top: "50%",
                right: "-2%",
                transform: "translate(-50%, -50%) rotate(-15deg)",
                fontSize: "10rem",
                fontWeight: 800,
                color: "rgba(255,255,255,0.03)",
                letterSpacing: "0.1em",
                whiteSpace: "nowrap",
              }}
              aria-hidden="true"
            >
              APPROVED
            </div>
            <div className="relative z-10 max-w-3xl mx-auto text-center px-6">
              <div
                className="landing-hero-anim inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-6"
                style={{
                  background: "rgba(194, 64, 12, 0.15)",
                  color: "#F7A072",
                  border: "1px solid rgba(194, 64, 12, 0.3)",
                }}
              >
                Built for University Purchasing
              </div>
              <h1
                className="landing-hero-anim font-bold text-white mb-5"
                style={{ fontSize: "clamp(2.2rem, 5vw, 3.2rem)", lineHeight: 1.15, letterSpacing: "-0.02em" }}
              >
                Purchase requests,<br />stamped and tracked.
              </h1>
              <p
                className="landing-hero-anim max-w-xl mx-auto mb-10"
                style={{ fontSize: "1.2rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.7 }}
              >
                A modern procurement portal for student organizations. Submit requests, get advisor approval, and track orders — all in one place.
              </p>
              <div className="landing-hero-anim flex gap-4 justify-center flex-wrap">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-lg font-semibold transition-colors"
                  style={{ padding: "0.85rem 2rem", fontSize: "1rem", background: "var(--l-stamp)", color: "white" }}
                >
                  Get Started
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-lg font-semibold transition-all"
                  style={{
                    padding: "0.85rem 2rem",
                    fontSize: "1rem",
                    background: "transparent",
                    color: "white",
                    border: "2px solid rgba(255,255,255,0.5)",
                  }}
                >
                  See How It Works
                </a>
              </div>
            </div>
          </section>

          {/* ── Features ── */}
          <section id="features" style={{ padding: "6rem 0", background: "var(--l-paper)" }}>
            <div className="max-w-5xl mx-auto px-6">
              <SectionHeader
                title="Everything your purchasing office needs"
                subtitle="Streamline procurement from request to pickup with intelligent automation and clear visibility."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="landing-animate rounded-xl p-8 transition-all hover:-translate-y-0.5"
                    style={{
                      background: "var(--l-card)",
                      border: "1px solid var(--l-border)",
                      boxShadow: "var(--l-shadow-card)",
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                      style={{ background: "var(--l-navy)" }}
                    >
                      {f.icon}
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                    <p style={{ fontSize: "0.92rem", color: "var(--l-ink-secondary)", lineHeight: 1.6 }}>
                      {f.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── How It Works ── */}
          <section id="how-it-works" style={{ padding: "6rem 0", background: "var(--l-card)" }}>
            <div className="max-w-5xl mx-auto px-6">
              <SectionHeader
                title="From request to pickup in 8 steps"
                subtitle="A clear workflow ensures nothing gets lost and everyone knows where things stand."
              />
              {/* Desktop pipeline */}
              <div className="hidden md:flex items-start justify-center relative py-8">
                {PIPELINE_STEPS.map((step, i) => (
                  <div
                    key={step.label}
                    className="landing-animate flex flex-col items-center text-center relative"
                    style={{ flex: 1, maxWidth: 140, transitionDelay: `${i * 60}ms` }}
                  >
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div
                        className="absolute"
                        style={{
                          top: 22,
                          left: "calc(50% + 22px)",
                          width: "calc(100% - 44px)",
                          height: 3,
                          background: "var(--l-border)",
                          zIndex: 1,
                        }}
                      />
                    )}
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm relative z-10"
                      style={{ background: step.color, flexShrink: 0 }}
                    >
                      {i + 1}
                    </div>
                    <div className="font-semibold mt-3 text-xs" style={{ lineHeight: 1.3 }}>{step.label}</div>
                    <div className="mt-1 text-xs" style={{ color: "var(--l-ink-muted)", lineHeight: 1.4 }}>
                      {step.desc}
                    </div>
                  </div>
                ))}
              </div>
              {/* Mobile pipeline */}
              <div className="md:hidden flex flex-col gap-0 pl-6 py-4">
                {PIPELINE_STEPS.map((step, i) => (
                  <div key={step.label} className="landing-animate flex items-start gap-4 relative pb-8">
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div
                        className="absolute"
                        style={{
                          top: 44,
                          left: 21,
                          width: 3,
                          height: "calc(100% - 44px)",
                          background: "var(--l-border)",
                        }}
                      />
                    )}
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm relative z-10 shrink-0"
                      style={{ background: step.color }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{step.label}</div>
                      <div className="text-xs" style={{ color: "var(--l-ink-muted)" }}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Callout */}
              <div
                className="landing-animate max-w-lg mx-auto mt-8 p-4 rounded-r-lg"
                style={{
                  background: "#FFF7ED",
                  borderLeft: "4px solid var(--l-stamp)",
                }}
              >
                <p className="text-sm" style={{ color: "var(--l-ink-secondary)" }}>
                  <strong style={{ color: "var(--l-stamp)" }}>Stale alert:</strong> Requests without updates for 5+ days are automatically flagged so nothing slips through the cracks.
                </p>
              </div>
            </div>
          </section>

          {/* ── Roles ── */}
          <section id="roles" style={{ padding: "6rem 0", background: "var(--l-paper)" }}>
            <div className="max-w-5xl mx-auto px-6">
              <SectionHeader
                title="Designed for every role on campus"
                subtitle="From students to finance admins, everyone gets the tools and visibility they need."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {ROLES.map((role) => (
                  <div
                    key={role.title}
                    className="landing-animate rounded-xl p-7"
                    style={{
                      background: "var(--l-card)",
                      border: "1px solid var(--l-border)",
                      borderLeft: `4px solid ${role.color}`,
                      boxShadow: "var(--l-shadow-card)",
                    }}
                  >
                    <h3 className="font-semibold text-lg">{role.title}</h3>
                    <p className="text-xs mb-3" style={{ color: "var(--l-ink-muted)" }}>{role.subtitle}</p>
                    <ul className="space-y-1.5">
                      {role.items.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--l-ink-secondary)" }}>
                          <span
                            className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                            style={{ background: role.color, opacity: 0.5 }}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Getting Started ── */}
          <section id="get-started" style={{ padding: "6rem 0", background: "var(--l-card)" }}>
            <div className="max-w-5xl mx-auto px-6">
              <SectionHeader
                title="Up and running in minutes"
                subtitle="Whether you're setting up for your institution or joining as a user, onboarding is simple."
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <OnboardingTrack
                  title="For Institutions"
                  icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--l-navy)" strokeWidth="1.5" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M9 12L11 14L15 10" />
                    </svg>
                  }
                  steps={[
                    { title: "Create your tenant", desc: "Run the one-time setup to register your institution, email domain, and create the first super admin account." },
                    { title: "Configure authentication", desc: "Connect Azure AD for SSO with your university accounts, or use email and password credentials." },
                    { title: "Invite your team", desc: "Add admin staff and finance users. Set up organizations, budgets, and email integration — then you're live." },
                  ]}
                />
                <OnboardingTrack
                  title="For Users"
                  icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--l-navy)" strokeWidth="1.5" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M5 20C5 17.24 8.13 15 12 15C15.87 15 19 17.24 19 20" />
                    </svg>
                  }
                  steps={[
                    { title: "Sign in", desc: "Use your university SSO account or the credentials provided by your admin. Your role is auto-detected from your email domain." },
                    { title: "Choose your role & organization", desc: "Select whether you're a student or org leader, then join an existing organization or create a new one." },
                    { title: "Start submitting", desc: "Create your first purchase request with items, vendors, and justification. Track it through every stage to pickup." },
                  ]}
                />
              </div>
              <div className="text-center mt-14">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-lg font-semibold transition-colors"
                  style={{ padding: "0.85rem 2rem", fontSize: "1rem", background: "var(--l-stamp)", color: "white" }}
                >
                  Get Started with Stamped
                </Link>
              </div>
            </div>
          </section>

          {/* ── Tech Stack ── */}
          <section id="tech" style={{ padding: "6rem 0", background: "var(--l-navy-dark)" }}>
            <div className="max-w-5xl mx-auto px-6 text-center">
              <div className="mb-16">
                <h2 className="text-white font-bold mb-3" style={{ fontSize: "2.2rem", letterSpacing: "-0.01em" }}>
                  Built with modern tools
                </h2>
                <p className="max-w-xl mx-auto" style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.6)" }}>
                  A robust, scalable stack designed for reliability and developer productivity.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center mb-8">
                {TECH_PILLS.map((pill) => (
                  <span
                    key={pill}
                    className="px-5 py-2 rounded-full text-sm font-medium transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {pill}
                  </span>
                ))}
              </div>
              <p className="max-w-2xl mx-auto" style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                Stamped is a Next.js application backed by Prisma ORM and PostgreSQL, with Claude AI for intelligent email parsing and approval automation. Enterprise SSO via Azure AD keeps authentication simple and secure.
              </p>
            </div>
          </section>
        </main>

        {/* ── Footer ── */}
        <footer style={{ background: "var(--l-navy-dark)", padding: "3rem 0 1.5rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="max-w-5xl mx-auto px-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--l-navy)" }}>
                  <ClipboardLogo />
                </div>
                <div>
                  <div className="text-white font-bold text-lg">Stamped</div>
                  <div className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>University Purchasing Management</div>
                </div>
              </div>
              <nav className="flex gap-6">
                {["Features", "How It Works", "Roles", "Get Started"].map((label) => (
                  <a
                    key={label}
                    href={`#${label.toLowerCase().replace(/\s+/g, "-")}`}
                    className="text-sm transition-colors"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    {label}
                  </a>
                ))}
              </nav>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg font-semibold transition-colors"
                style={{ padding: "0.6rem 1.4rem", fontSize: "0.9rem", background: "var(--l-stamp)", color: "white" }}
              >
                Get Started
              </Link>
            </div>
            <div
              className="text-center pt-6 text-xs"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
            >
              &copy; {new Date().getFullYear()} Stamped. Built for educational institutions.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

/* ─── Sub-components ───────────────────────────────────────────────────────── */

function Nav() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--l-border)",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-16">
        <a href="#" className="flex items-center gap-3 no-underline font-bold text-lg" style={{ color: "var(--l-navy)" }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--l-navy)" }}>
            <ClipboardLogo />
          </div>
          Stamped
        </a>
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: "Features", href: "#features" },
            { label: "How It Works", href: "#how-it-works" },
            { label: "Roles", href: "#roles" },
            { label: "Get Started", href: "#get-started" },
            { label: "Tech", href: "#tech" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium transition-colors"
              style={{ color: "var(--l-ink-secondary)" }}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg font-semibold transition-colors"
            style={{ padding: "0.5rem 1.25rem", fontSize: "0.9rem", background: "var(--l-navy)", color: "white" }}
          >
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center mb-16">
      <h2 className="font-bold mb-3" style={{ fontSize: "2.2rem", letterSpacing: "-0.01em" }}>{title}</h2>
      <p className="max-w-xl mx-auto" style={{ fontSize: "1.1rem", color: "var(--l-ink-secondary)" }}>{subtitle}</p>
    </div>
  );
}

function OnboardingTrack({
  title,
  icon,
  steps,
}: {
  title: string;
  icon: React.ReactNode;
  steps: { title: string; desc: string }[];
}) {
  return (
    <div className="landing-animate">
      <h3 className="font-semibold text-xl flex items-center gap-2 mb-8">{icon} {title}</h3>
      <div className="flex flex-col gap-6">
        {steps.map((step, i) => (
          <div key={step.title} className="flex gap-4 items-start">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ background: "var(--l-navy)" }}
            >
              {i + 1}
            </div>
            <div>
              <h4 className="font-semibold mb-1">{step.title}</h4>
              <p className="text-sm" style={{ color: "var(--l-ink-secondary)" }}>{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
