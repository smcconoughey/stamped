"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import * as XLSX from "xlsx";

type Row = Record<string, string>;
type ImportResults = { imported: number; skipped: number; errors: string[] };
type TabId = "requests" | "budgets" | "members";
type ColorHint = { row: number; color: string };

const TEMPLATES: Record<TabId, { headers: string[]; example: Record<string, string> }> = {
  requests: {
    headers: ["organization", "title", "justification", "advisor_email", "vendor", "quantity", "unit_price", "url", "priority", "needed_by"],
    example: { organization: "Robotics Club", title: "Arduino Mega", justification: "For robot build", advisor_email: "prof@erau.edu", vendor: "DigiKey", quantity: "5", unit_price: "45.00", url: "https://digikey.com", priority: "HIGH", needed_by: "2025-03-01" },
  },
  budgets: {
    headers: ["organization", "budget_name", "project_number", "cost_center", "fiscal_year", "allocated", "notes"],
    example: { organization: "Robotics Club", budget_name: "COE Budget", project_number: "PJ20006", cost_center: "CC-1234", fiscal_year: "FY2025", allocated: "5000.00", notes: "College of Engineering allocation" },
  },
  members: {
    headers: ["email", "name", "role", "organization", "password"],
    example: { email: "student@my.erau.edu", name: "Alex Student", role: "STUDENT", organization: "Robotics Club", password: "" },
  },
};

const TAB_LABELS: Record<TabId, string> = {
  requests: "Purchase Requests",
  budgets: "Budgets",
  members: "Members",
};

const TAB_DESCRIPTIONS: Record<TabId, string> = {
  requests: "Import in-flight or historical purchase requests from a spreadsheet.",
  budgets: "Load budget allocations per organization and fiscal year.",
  members: "Add or update org members in bulk. Password column is optional (leave blank for SSO-only users).",
};

function downloadTemplate(tab: TabId) {
  const { headers, example } = TEMPLATES[tab];
  const ws = XLSX.utils.aoa_to_sheet([headers, headers.map(h => example[h] ?? "")]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `stamped-${tab}-template.xlsx`);
}

function parseFile(file: File): Promise<{ rows: Row[]; colorHints: ColorHint[]; metadata: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "binary", cellStyles: true });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Parse as raw arrays first so we can find the real header row
        const rawRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];

        // Find the header row: first row with 2+ recognisable column keywords
        const HEADER_KEYWORDS = ["supplier","description","qty","quantity","price","date","email","vendor","item","name","amount","cost","budget","role","organization"];
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(10, rawRows.length); i++) {
          const text = rawRows[i].map(c => String(c).toLowerCase()).join(" ");
          if (HEADER_KEYWORDS.filter(k => text.includes(k)).length >= 2) {
            headerRowIdx = i;
            break;
          }
        }

        // Extract metadata from rows above the header
        const metadata: Record<string, string> = {};
        for (let i = 0; i < headerRowIdx; i++) {
          const cells = rawRows[i].map(c => String(c).trim()).filter(Boolean);
          const rowText = cells.join(" ");

          // Budget total — first standalone number ≥ 4 digits
          if (!metadata.budget_total) {
            const m = rowText.match(/\b(\d{4,}(?:\.\d{1,2})?)\b/);
            if (m) metadata.budget_total = m[1];
          }
          // Cost center
          const cc = rowText.match(/cost\s*center[:\s]+([A-Z0-9]+)/i);
          if (cc) metadata.cost_center = cc[1];
          // Project number
          const pj = rowText.match(/\bPJ\d+\b/i);
          if (pj) metadata.project_number = pj[0];
          // Org name — first non-empty cell of first metadata row
          if (i === 0 && cells[0] && cells[0].length > 3) metadata.organization = cells[0];
          // Budget name — second distinct metadata row
          if (i === 1 && cells[0] && cells[0].length > 3) metadata.budget_name = cells[0];
          // Org name from row 2 if it looks like an org name (contains project or lab)
          if (i === 2 && cells[0] && /lab|club|society|council|team|project/i.test(cells[0])) {
            metadata.organization = cells[0].replace(/\s+PJ\d+/i, "").trim();
          }
        }

        // Build normalised column headers from the header row
        const headers = rawRows[headerRowIdx].map(h =>
          String(h).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
        );

        // Build data rows (skip empty rows)
        const normalized: Row[] = [];
        for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
          const raw = rawRows[i];
          if (raw.every(c => !String(c).trim())) continue;
          const row: Row = {};
          headers.forEach((h, idx) => { if (h) row[h] = String(raw[idx] ?? ""); });
          normalized.push(row);
        }

        // Extract dominant fill color per data row
        const colorHints: ColorHint[] = [];
        const ref = ws["!ref"];
        if (ref) {
          const range = XLSX.utils.decode_range(ref);
          for (let r = range.s.r + headerRowIdx + 1; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
              const cell = ws[XLSX.utils.encode_cell({ r, c })];
              const rgb = cell?.s?.fgColor?.rgb ?? cell?.s?.bgColor?.rgb;
              if (rgb && rgb !== "00000000" && rgb !== "FFFFFFFF" && rgb !== "FF000000") {
                colorHints.push({ row: r - range.s.r - headerRowIdx - 1, color: `#${rgb.slice(-6).toUpperCase()}` });
                break;
              }
            }
          }
        }

        resolve({ rows: normalized, colorHints, metadata });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function ImportInner() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const searchParams = useSearchParams();

  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  const isOrgLead = user?.role === "ORG_LEAD";

  const [tab, setTab] = useState<TabId>("requests");
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [colorHints, setColorHints] = useState<ColorHint[]>([]);
  const [aiNormalized, setAiNormalized] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiMetadata, setAiMetadata] = useState<Record<string, string>>({});
  const [normalizing, setNormalizing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [availableBudgets, setAvailableBudgets] = useState<{ id: string; label: string }[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");

  useEffect(() => {
    const t = searchParams.get("tab") as TabId | null;
    if (t && ["requests", "budgets", "members"].includes(t)) switchTab(t);
  }, []);

  useEffect(() => {
    if (tab !== "requests") return;
    fetch("/api/budgets").then(r => r.json()).then(d => {
      setAvailableBudgets((d.budgets ?? []).map((b: any) => ({ id: b.id, label: b.label })));
    }).catch(() => {});
  }, [tab]);

  const canImportBudgets = isAdmin;
  const canImportMembers = isAdmin || isOrgLead;

  async function loadFile(file: File) {
    setResults(null);
    setError("");
    setAiNormalized(false);
    setAiWarnings([]);
    setAiMetadata({});
    let parsed: Row[] = [];
    let hints: ColorHint[] = [];
    let metadata: Record<string, string> = {};
    try {
      ({ rows: parsed, colorHints: hints, metadata } = await parseFile(file));
      setRows(parsed);
      setColorHints(hints);
      setAiMetadata(metadata);
      setFileName(file.name);
    } catch {
      setError("Could not parse file. Make sure it's a valid CSV or XLSX.");
      return;
    }
    // Auto-normalize with AI immediately
    if (parsed.length) {
      setNormalizing(true);
      try {
        const res = await fetch("/api/import/ai-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: parsed, colorHints: hints, type: tab, knownMetadata: metadata }),
        });
        const data = await res.json();
        if (res.ok) {
          setRows(data.rows);
          setAiNormalized(true);
          setAiWarnings(data.warnings ?? []);
          setAiMetadata(data.metadata ?? {});
        }
      } catch {
        // Silent fail — user can still import raw rows
      } finally {
        setNormalizing(false);
      }
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, [tab]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  }

  function switchTab(t: TabId) {
    setTab(t);
    setRows([]);
    setFileName("");
    setColorHints([]);
    setAiNormalized(false);
    setAiWarnings([]);
    setAiMetadata({});
    setResults(null);
    setError("");
    setSelectedBudgetId("");
  }

  async function runImport() {
    if (!rows.length) return;
    setImporting(true);
    setResults(null);
    setError("");

    const endpoint =
      tab === "requests" ? "/api/import" :
      tab === "budgets"  ? "/api/import/budgets" :
                           "/api/import/members";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, metadata: aiMetadata, ...(tab === "requests" && selectedBudgetId ? { forceBudgetId: selectedBudgetId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed"); return; }
      setResults(data.results);
      if (data.results.imported > 0) setRows([]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  const previewCols = rows.length > 0 ? Object.keys(rows[0]).slice(0, 7) : [];

  return (
    <div>
      <Header title="Import Data" subtitle="Bulk import requests, budgets, and members from spreadsheets" />

      <div className="p-6 max-w-5xl space-y-6">
        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["requests", "budgets", "members"] as TabId[]).map(t => {
            if (t === "budgets" && !canImportBudgets) return null;
            if (t === "members" && !canImportMembers) return null;
            if (t === "requests" && !isAdmin && !isOrgLead) return null;
            return (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-navy text-navy" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            );
          })}
        </div>

        <div className="card p-6 space-y-5">
          {/* Description + template */}
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-ink-secondary">{TAB_DESCRIPTIONS[tab]}</p>
            <button
              onClick={() => downloadTemplate(tab)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs font-medium text-ink-secondary hover:bg-paper transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download template
            </button>
          </div>

          {/* Expected columns hint */}
          <div className="bg-paper rounded px-3 py-2 text-xs font-mono text-ink-muted overflow-x-auto whitespace-nowrap">
            {TEMPLATES[tab].headers.join(", ")}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragging ? "border-navy bg-navy/5" : "border-border hover:border-navy/50 hover:bg-paper"
            }`}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} className="hidden" />
            <svg className="w-8 h-8 text-ink-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {normalizing ? (
              <p className="text-sm font-medium text-navy flex items-center gap-2 justify-center">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Analyzing with AI…
              </p>
            ) : fileName ? (
              <p className="text-sm font-medium text-navy">{fileName} — {rows.length} row{rows.length !== 1 ? "s" : ""} parsed</p>
            ) : (
              <>
                <p className="text-sm font-medium text-ink">Drop a file here or click to upload</p>
                <p className="text-xs text-ink-muted mt-1">CSV or XLSX · AI normalizes columns automatically</p>
              </>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Preview table */}
          {rows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  Preview — {rows.length} row{rows.length !== 1 ? "s" : ""}
                  {aiNormalized && <span className="ml-2 text-green-600 normal-case font-normal">✦ AI normalized</span>}
                </p>
              </div>

              {Object.keys(aiMetadata).filter(k => aiMetadata[k]).length > 0 && (
                <div className="mb-3 px-3 py-2 bg-navy/5 border border-navy/20 rounded text-xs text-ink space-y-0.5">
                  <p className="font-semibold text-navy mb-1">Detected from spreadsheet</p>
                  {aiMetadata.organization && <p>Organization: <strong>{aiMetadata.organization}</strong></p>}
                  {aiMetadata.budget_total && <p>Budget total: <strong>${aiMetadata.budget_total}</strong></p>}
                  {aiMetadata.cost_center && <p>Cost center: <strong>{aiMetadata.cost_center}</strong></p>}
                  {aiMetadata.fiscal_year && <p>Fiscal year: <strong>{aiMetadata.fiscal_year}</strong></p>}
                </div>
              )}

              {aiWarnings.length > 0 && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-0.5">
                  {aiWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}

              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-paper border-b border-border">
                    <tr>
                      {previewCols.map(c => (
                        <th key={c} className="px-3 py-2 text-left font-medium text-ink-muted whitespace-nowrap">{c}</th>
                      ))}
                      {Object.keys(rows[0]).length > 7 && <th className="px-3 py-2 text-ink-muted">…</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 8).map((row, i) => (
                      <tr key={i} className="hover:bg-paper/50">
                        {previewCols.map(c => (
                          <td key={c} className="px-3 py-2 text-ink max-w-[160px] truncate">{row[c]}</td>
                        ))}
                        {Object.keys(row).length > 7 && <td className="px-3 py-2 text-ink-muted">…</td>}
                      </tr>
                    ))}
                    {rows.length > 8 && (
                      <tr>
                        <td colSpan={previewCols.length + 1} className="px-3 py-2 text-center text-ink-muted">
                          + {rows.length - 8} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {tab === "requests" && availableBudgets.length > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-sm font-medium text-ink whitespace-nowrap">Assign to budget:</label>
                  <select
                    value={selectedBudgetId}
                    onChange={e => setSelectedBudgetId(e.target.value)}
                    className="flex-1 border border-border rounded px-2 py-1.5 text-sm bg-white text-ink focus:outline-none focus:ring-1 focus:ring-navy"
                  >
                    <option value="">— auto-detect from spreadsheet —</option>
                    {availableBudgets.map(b => (
                      <option key={b.id} value={b.id}>{b.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={runImport}
                  disabled={importing}
                  className="px-5 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60"
                >
                  {importing ? "Importing..." : `Import ${rows.length} row${rows.length !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={() => { setRows([]); setFileName(""); setColorHints([]); setAiNormalized(false); setAiWarnings([]); setSelectedBudgetId(""); }}
                  className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className={`rounded-lg border p-4 ${results.errors.length > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
              <p className="text-sm font-semibold text-ink mb-1">
                {results.imported > 0 ? `✓ ${results.imported} imported` : "Nothing imported"}
                {results.skipped > 0 ? `, ${results.skipped} skipped` : ""}
              </p>
              {results.errors.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {results.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  return <Suspense><ImportInner /></Suspense>;
}
