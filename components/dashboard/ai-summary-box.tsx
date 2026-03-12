"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AISummaryBox() {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", { method: "POST" });
      if (!res.ok) throw new Error("Failed to load summary");
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      setError("Could not load AI summary.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink">AI Queue Summary</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSummary}
          disabled={loading}
          className="text-xs text-navy"
        >
          {loading ? "Loading..." : summary ? "Refresh" : "Generate"}
        </Button>
      </div>

      {!summary && !loading && !error && (
        <p className="text-xs text-ink-muted">
          Click Generate to get an AI-powered summary of the current request queue.
        </p>
      )}

      {loading && (
        <div className="space-y-2">
          <div className="h-3 bg-paper rounded animate-pulse w-full" />
          <div className="h-3 bg-paper rounded animate-pulse w-5/6" />
          <div className="h-3 bg-paper rounded animate-pulse w-4/6" />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {summary && !loading && (
        <p className="text-sm text-ink-secondary leading-relaxed">{summary}</p>
      )}
    </div>
  );
}
