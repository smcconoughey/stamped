"use client";

import { useState } from "react";

const STAMP_CONFIG: Record<string, { verb: string; color: string; bg: string; border: string; ink: string; glow: string }> = {
  SUBMITTED:        { verb: "Submit",          color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-400",    ink: "#3b82f6", glow: "rgba(59,130,246,0.3)" },
  PENDING_APPROVAL: { verb: "Send for Approval", color: "text-yellow-700", bg: "bg-yellow-50",  border: "border-yellow-400",  ink: "#eab308", glow: "rgba(234,179,8,0.3)" },
  APPROVED:         { verb: "Approve",         color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-500", ink: "#10b981", glow: "rgba(16,185,129,0.3)" },
  ORDERED:          { verb: "Mark Ordered",    color: "text-indigo-700",  bg: "bg-indigo-50",   border: "border-indigo-400",  ink: "#6366f1", glow: "rgba(99,102,241,0.3)" },
  RECEIVED:         { verb: "Mark Received",   color: "text-teal-700",    bg: "bg-teal-50",     border: "border-teal-400",    ink: "#14b8a6", glow: "rgba(20,184,166,0.3)" },
  READY_FOR_PICKUP: { verb: "Mark Ready",      color: "text-purple-700",  bg: "bg-purple-50",   border: "border-purple-400",  ink: "#a855f7", glow: "rgba(168,85,247,0.3)" },
  PICKED_UP:        { verb: "Picked Up ✓",     color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-400",   ink: "#f59e0b", glow: "rgba(245,158,11,0.3)" },
  CANCELLED:        { verb: "Cancel",          color: "text-red-700",     bg: "bg-red-50",      border: "border-red-400",     ink: "#ef4444", glow: "rgba(239,68,68,0.3)" },
};

type Props = {
  targetStatus: string;
  onStamp: (status: string) => Promise<void>;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function RowStampButton({ targetStatus, onStamp, disabled, size = "md" }: Props) {
  const [pressing, setPressing] = useState(false);
  const [inkKey, setInkKey] = useState(0);
  const cfg = STAMP_CONFIG[targetStatus];
  if (!cfg) return null;

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled || pressing) return;
    setPressing(true);
    setInkKey(k => k + 1);
    await new Promise(r => setTimeout(r, 160));
    try { await onStamp(targetStatus); } finally { setPressing(false); }
  }

  const isSm = size === "sm";

  return (
    <div className="relative inline-flex items-center justify-center">
      <style>{`
        @keyframes rsbPress { 0%{transform:scale(1) translateY(0)} 30%{transform:scale(0.87) translateY(3px)} 65%{transform:scale(1.06) translateY(-2px)} 100%{transform:scale(1) translateY(0)} }
        @keyframes rsbRing  { 0%{transform:scale(0);opacity:.8} 100%{transform:scale(2.8);opacity:0} }
        @keyframes rsbDot   { 0%{transform:translate(0,0) scale(1);opacity:.9} 100%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:0} }
      `}</style>

      {/* Ink burst layer */}
      {inkKey > 0 && (
        <div key={inkKey} className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible z-10">
          <div className="absolute rounded-full border-2"
            style={{ width: 32, height: 32, borderColor: cfg.ink, animation: "rsbRing 0.4s ease-out forwards" }} />
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const d = 22 + (i % 3) * 8;
            return (
              <div key={i} className="absolute rounded-full"
                style={{
                  width: isSm ? 4 : 5, height: isSm ? 4 : 5, backgroundColor: cfg.ink, opacity: 0,
                  "--tx": `${Math.cos(angle) * d}px`, "--ty": `${Math.sin(angle) * d}px`,
                  animation: `rsbDot 0.38s ${i * 0.02}s ease-out forwards`,
                } as any} />
            );
          })}
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={disabled || pressing}
        title={cfg.verb}
        className={`relative font-bold uppercase tracking-wide border-2 rounded select-none transition-shadow whitespace-nowrap
          ${cfg.color} ${cfg.bg} ${cfg.border}
          ${isSm ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1"}
          ${pressing ? "" : "hover:shadow-md"}
          disabled:opacity-40 disabled:cursor-not-allowed`}
        style={{
          animation: pressing ? "rsbPress 0.38s cubic-bezier(0.34,1.56,0.64,1)" : undefined,
          boxShadow: pressing ? `0 0 12px ${cfg.glow}` : undefined,
          letterSpacing: "0.08em",
          fontFamily: "Georgia, serif",
        }}
      >
        {pressing ? "…" : cfg.verb}
      </button>
    </div>
  );
}
