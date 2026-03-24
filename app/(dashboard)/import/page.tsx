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

const TAB_LABELS: Record<TabId, string> = { requests: "Purchase Requests", budgets: "Budgets", members: "Members" };
const TAB_DESCRIPTIONS: Record<TabId, string> = {
  requests: "Import purchase requests from any spreadsheet format. AI parses all sheets automatically.",
  budgets: "Load budget allocations per organization and fiscal year.",
  members: "Add or update org members in bulk. Password column is optional (leave blank for SSO-only users).",
};

// ── Editable grid column definitions ─────────────────────────────────────────

type ColDef = { key: string; label: string; width: number; required?: boolean; type?: "text" | "select"; options?: string[] };

const STATUS_OPTIONS = ["DRAFT","SUBMITTED","PENDING_APPROVAL","APPROVED","ORDERED","PARTIALLY_RECEIVED","RECEIVED","READY_FOR_PICKUP","PICKED_UP","CANCELLED"];
const PRIORITY_OPTIONS = ["LOW","NORMAL","HIGH","URGENT"];
const ROLE_OPTIONS = ["STUDENT","ORG_LEAD","ADMIN_STAFF","FINANCE_ADMIN","SUPER_ADMIN"];

const GRID_COLS: Record<TabId, ColDef[]> = {
  requests: [
    { key: "title",         label: "Title",          width: 220, required: true },
    { key: "organization",  label: "Organization",   width: 160, required: true },
    { key: "advisor_email", label: "Advisor Email",  width: 180 },
    { key: "advisor_name",  label: "Advisor Name",   width: 140 },
    { key: "vendor",        label: "Vendor",         width: 120 },
    { key: "quantity",      label: "Qty",            width: 60 },
    { key: "unit_price",    label: "Unit Price",     width: 90 },
    { key: "status",        label: "Status",         width: 160, type: "select", options: STATUS_OPTIONS },
    { key: "priority",      label: "Priority",       width: 100, type: "select", options: PRIORITY_OPTIONS },
    { key: "description",   label: "Description",    width: 200 },
    { key: "justification", label: "Justification",  width: 200 },
    { key: "notes",         label: "Notes",          width: 160 },
    { key: "url",           label: "URL",            width: 180 },
  ],
  budgets: [
    { key: "organization",   label: "Organization",  width: 160, required: true },
    { key: "budget_name",    label: "Budget Name",   width: 160 },
    { key: "cost_center",    label: "Cost Center",   width: 120 },
    { key: "project_number", label: "Project #",     width: 120 },
    { key: "fiscal_year",    label: "Fiscal Year",   width: 100 },
    { key: "allocated",      label: "Allocated",     width: 100, required: true },
    { key: "notes",          label: "Notes",         width: 200 },
  ],
  members: [
    { key: "email",        label: "Email",       width: 200, required: true },
    { key: "name",         label: "Name",        width: 160 },
    { key: "role",         label: "Role",        width: 140, type: "select", options: ROLE_OPTIONS },
    { key: "organization", label: "Organization",width: 160 },
  ],
};

function downloadTemplate(tab: TabId) {
  const { headers, example } = TEMPLATES[tab];
  const ws = XLSX.utils.aoa_to_sheet([headers, headers.map(h => example[h] ?? "")]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, `stamped-${tab}-template.xlsx`);
}

// ── Multi-sheet file parser ───────────────────────────────────────────────────

function parseSheetRows(ws: XLSX.WorkSheet): {
  rows: Row[]; colorHints: ColorHint[]; metadata: Record<string, string>; rawGrid: string[][]
} {
  const rawRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];

  const HEADER_KEYWORDS = ["supplier","description","qty","quantity","price","date","email","vendor","item","name","amount","cost","budget","role","organization"];
  const allHeaderRows: number[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const text = rawRows[i].map(c => String(c).toLowerCase()).join(" ");
    if (HEADER_KEYWORDS.filter(k => text.includes(k)).length >= 2) allHeaderRows.push(i);
  }
  const headerRowIdx = allHeaderRows[0] ?? 0;

  const metadata: Record<string, string> = {};
  for (let i = 0; i < headerRowIdx; i++) {
    const cells = rawRows[i].map(c => String(c).trim()).filter(Boolean);
    const rowText = cells.join(" ");
    if (!metadata.budget_total) { const m = rowText.match(/\b(\d{4,}(?:\.\d{1,2})?)\b/); if (m) metadata.budget_total = m[1]; }
    const cc = rowText.match(/cost\s*center[:\s]+([A-Z0-9-]+)/i); if (cc) metadata.cost_center = cc[1];
    const pj = rowText.match(/\bPJ\d+\b/i); if (pj) metadata.project_number = pj[0];
    if (i === 0 && cells[0] && cells[0].length > 3) metadata.organization = cells[0];
    if (i === 1 && cells[0] && cells[0].length > 3) metadata.budget_name = cells[0];
    if (i === 2 && cells[0] && /lab|club|society|council|team|project/i.test(cells[0])) metadata.organization = cells[0].replace(/\s+PJ\d+/i, "").trim();
  }

  const headers = rawRows[headerRowIdx].map(h => String(h).toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const normalized: Row[] = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (raw.every(c => !String(c).trim())) continue;
    const row: Row = {};
    headers.forEach((h, idx) => { if (h) row[h] = String(raw[idx] ?? ""); });
    normalized.push(row);
  }

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

  const rawGrid = rawRows.slice(0, 300).map(r => r.slice(0, 20).map(c => String(c ?? "").trim()));
  return { rows: normalized, colorHints, metadata, rawGrid };
}

function parseFile(file: File): Promise<{
  rows: Row[]; colorHints: ColorHint[]; metadata: Record<string, string>; rawGrid: string[][]; isComplex: boolean; sheetNames: string[]
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "binary", cellStyles: true });

        const allRows: Row[] = [];
        const allColorHints: ColorHint[] = [];
        let mergedMetadata: Record<string, string> = {};
        // Build a combined raw grid with sheet labels for the AI
        const combinedGridLines: string[] = [];
        let isComplex = false;

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const { rows, colorHints, metadata, rawGrid } = parseSheetRows(ws);

          // Offset color hints by current row count
          const offset = allRows.length;
          colorHints.forEach(h => allColorHints.push({ row: h.row + offset, color: h.color }));
          allRows.push(...rows);
          mergedMetadata = { ...metadata, ...mergedMetadata }; // first sheet wins for org etc

          // Add sheet separator to raw grid
          combinedGridLines.push(`=== SHEET: ${sheetName} ===`);
          rawGrid.forEach((row, i) => {
            const cells = row.filter((_, ci) => ci < 20);
            if (cells.some(c => c)) combinedGridLines.push(`R${i + 1}: ${cells.join(" | ")}`);
          });
          combinedGridLines.push("");

          // Detect complexity
          const HEADER_KEYWORDS = ["supplier","description","qty","quantity","price","date","email","vendor","item","name","amount","cost","budget","role","organization"];
          let headerCount = 0;
          rawGrid.forEach(row => {
            const text = row.join(" ").toLowerCase();
            if (HEADER_KEYWORDS.filter(k => text.includes(k)).length >= 2) headerCount++;
          });
          if (headerCount > 1 || wb.SheetNames.length > 1) isComplex = true;
        }

        // Convert combined lines to a 2D grid for the AI (one line = one row, one cell)
        const rawGrid2D = combinedGridLines.map(l => [l]);

        resolve({
          rows: allRows,
          colorHints: allColorHints,
          metadata: mergedMetadata,
          rawGrid: rawGrid2D,
          isComplex,
          sheetNames: wb.SheetNames,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// ── Walkthrough ───────────────────────────────────────────────────────────────

function Walkthrough() {
  const [open, setOpen] = useState(true);
  return (
    <div className="card border-navy/20 bg-navy/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-sm font-semibold text-navy">How to import — quick guide</span>
        <svg className={`w-4 h-4 text-navy transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4 border-t border-navy/10">
          <ol className="mt-3 space-y-2 text-sm text-ink">
            <li className="flex gap-3"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-navy text-white text-xs flex items-center justify-center font-bold">1</span><span><strong>Upload</strong> your XLSX or CSV. AI reads <em>every sheet</em>, finds all tables (even multi-table layouts), merges linked descriptions, and normalizes column names automatically.</span></li>
            <li className="flex gap-3"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-navy text-white text-xs flex items-center justify-center font-bold">2</span><span><strong>Review warnings</strong> — the AI flags anything it assumed or corrected (typos, missing fields, color-coded rows, floating-point issues, etc.).</span></li>
            <li className="flex gap-3"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-navy text-white text-xs flex items-center justify-center font-bold">3</span><span><strong>Edit inline</strong> — click any cell to edit it. <span className="text-amber-700 font-medium">Yellow cells</span> are required fields that are empty. Tab or Enter moves to the next cell.</span></li>
            <li className="flex gap-3"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-navy text-white text-xs flex items-center justify-center font-bold">4</span><span><strong>Bulk update</strong> — check the boxes on the left to select rows, then use the toolbar at the bottom to set the same value across all selected rows at once (e.g. advisor email, status, organization).</span></li>
            <li className="flex gap-3"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-navy text-white text-xs flex items-center justify-center font-bold">5</span><span><strong>Assign a budget</strong> (optional) — links all imported requests to a specific cost center / project number.</span></li>
            <li className="flex gap-3"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-navy text-white text-xs flex items-center justify-center font-bold">6</span><span><strong>Import</strong> when everything looks right. You can always edit individual requests after import from the request detail page.</span></li>
          </ol>
          <p className="mt-3 text-xs text-ink-muted">Tip: most budget packet spreadsheets don't have an advisor email column — use bulk update (step 4) to add one quickly.</p>
        </div>
      )}
    </div>
  );
}

// ── Editable grid ─────────────────────────────────────────────────────────────

function EditableGrid({
  rows, cols, onChange, onDeleteRows,
}: {
  rows: Row[];
  cols: ColDef[];
  onChange: (rows: Row[]) => void;
  onDeleteRows: (indices: number[]) => void;
}) {
  const [editCell, setEditCell] = useState<{ row: number; col: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkField, setBulkField] = useState(cols[0]?.key ?? "");
  const [bulkVal, setBulkVal] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [editCell]);

  function startEdit(rowIdx: number, colKey: string) {
    setEditCell({ row: rowIdx, col: colKey });
    setEditVal(rows[rowIdx][colKey] ?? "");
  }

  function commitEdit() {
    if (!editCell) return;
    const updated = rows.map((r, i) =>
      i === editCell.row ? { ...r, [editCell.col]: editVal } : r
    );
    onChange(updated);
    setEditCell(null);
  }

  function onKeyDown(e: React.KeyboardEvent, rowIdx: number, colIdx: number) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      // Move to next cell
      const nextCol = colIdx + 1 < cols.length ? colIdx + 1 : 0;
      const nextRow = colIdx + 1 < cols.length ? rowIdx : rowIdx + 1;
      if (nextRow < rows.length) setTimeout(() => startEdit(nextRow, cols[nextCol].key), 0);
    } else if (e.key === "Escape") {
      setEditCell(null);
    }
  }

  function toggleRow(idx: number) {
    setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  }

  function toggleAll() {
    setSelected(s => s.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)));
  }

  function applyBulk() {
    if (!bulkVal && bulkVal !== "0") return;
    const updated = rows.map((r, i) => selected.has(i) ? { ...r, [bulkField]: bulkVal } : r);
    onChange(updated);
    setBulkVal("");
  }

  function addRow() {
    onChange([...rows, {}]);
  }

  const bulkCol = cols.find(c => c.key === bulkField);

  return (
    <div className="space-y-2">
      <div className="overflow-auto border border-border rounded-lg" style={{ maxHeight: 480 }}>
        <table className="text-xs border-collapse" style={{ minWidth: cols.reduce((s, c) => s + c.width + 32, 48) }}>
          <thead className="sticky top-0 z-10 bg-paper border-b border-border">
            <tr>
              <th className="px-2 py-2 w-8 border-r border-border">
                <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} className="cursor-pointer" />
              </th>
              {cols.map(col => (
                <th key={col.key} className="px-3 py-2 text-left font-semibold text-ink-muted whitespace-nowrap border-r border-border last:border-r-0" style={{ minWidth: col.width }}>
                  {col.label}{col.required && <span className="text-red-500 ml-0.5">*</span>}
                </th>
              ))}
              <th className="px-2 py-2 w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className={`border-b border-border ${selected.has(rowIdx) ? "bg-navy/5" : "hover:bg-paper/60"}`}>
                <td className="px-2 py-1 border-r border-border text-center">
                  <input type="checkbox" checked={selected.has(rowIdx)} onChange={() => toggleRow(rowIdx)} className="cursor-pointer" />
                </td>
                {cols.map((col, colIdx) => {
                  const val = row[col.key] ?? "";
                  const isEmpty = !val && col.required;
                  const isEditing = editCell?.row === rowIdx && editCell?.col === col.key;

                  return (
                    <td
                      key={col.key}
                      className={`px-0 py-0 border-r border-border last:border-r-0 ${isEmpty ? "bg-amber-50" : ""}`}
                      style={{ minWidth: col.width }}
                      onClick={() => !isEditing && startEdit(rowIdx, col.key)}
                    >
                      {isEditing ? (
                        col.type === "select" ? (
                          <select
                            ref={inputRef as React.RefObject<HTMLSelectElement>}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => onKeyDown(e, rowIdx, colIdx)}
                            className="w-full h-full px-3 py-1 text-xs border-0 outline-none ring-2 ring-navy bg-white"
                            style={{ minWidth: col.width }}
                          >
                            <option value="">—</option>
                            {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            ref={inputRef as React.RefObject<HTMLInputElement>}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => onKeyDown(e, rowIdx, colIdx)}
                            className="w-full h-full px-3 py-1 text-xs border-0 outline-none ring-2 ring-navy bg-white"
                            style={{ minWidth: col.width }}
                          />
                        )
                      ) : (
                        <div className={`px-3 py-1.5 truncate cursor-text ${isEmpty ? "text-amber-600 italic" : "text-ink"}`} style={{ maxWidth: col.width, minHeight: 28 }}>
                          {val || (isEmpty ? "required" : "")}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-1 py-1 text-center">
                  <button onClick={() => onDeleteRows([rowIdx])} className="text-ink-muted hover:text-red-500 transition-colors" title="Delete row">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row + row count */}
      <div className="flex items-center justify-between">
        <button onClick={addRow} className="text-xs text-navy hover:underline flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add row
        </button>
        <p className="text-xs text-ink-muted">{rows.length} row{rows.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-navy/5 border border-navy/20 rounded-lg">
          <span className="text-xs font-semibold text-navy whitespace-nowrap">{selected.size} selected</span>
          <span className="text-xs text-ink-muted">Set</span>
          <select
            value={bulkField}
            onChange={e => { setBulkField(e.target.value); setBulkVal(""); }}
            className="border border-border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-navy"
          >
            {cols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <span className="text-xs text-ink-muted">to</span>
          {bulkCol?.type === "select" ? (
            <select value={bulkVal} onChange={e => setBulkVal(e.target.value)} className="border border-border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-navy">
              <option value="">—</option>
              {bulkCol.options?.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              value={bulkVal}
              onChange={e => setBulkVal(e.target.value)}
              placeholder={`value for ${bulkCol?.label}`}
              className="border border-border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-navy w-48"
              onKeyDown={e => { if (e.key === "Enter") applyBulk(); }}
            />
          )}
          <button onClick={applyBulk} className="px-3 py-1 bg-navy text-white text-xs font-semibold rounded hover:bg-navy-light transition-colors">
            Apply to {selected.size}
          </button>
          <button onClick={() => { onDeleteRows(Array.from(selected)); setSelected(new Set()); }} className="px-3 py-1 border border-red-300 text-red-600 text-xs font-semibold rounded hover:bg-red-50 transition-colors">
            Delete selected
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-ink-muted hover:text-ink ml-auto">
            Deselect all
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ImportInner() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const searchParams = useSearchParams();

  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);
  const isOrgLead = user?.role === "ORG_LEAD";

  const [tab, setTab] = useState<TabId>("requests");
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [colorHints, setColorHints] = useState<ColorHint[]>([]);
  const [aiNormalized, setAiNormalized] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [aiMetadata, setAiMetadata] = useState<Record<string, string>>({});
  const [isComplex, setIsComplex] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [availableBudgets, setAvailableBudgets] = useState<{ id: string; label: string }[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");

  const cols = GRID_COLS[tab];

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
    setResults(null); setError(""); setAiNormalized(false); setAiWarnings([]); setAiMetadata({});
    setIsComplex(false); setSheetNames([]);
    let parsed: Row[] = []; let hints: ColorHint[] = []; let metadata: Record<string, string> = {};
    let rawGrid: string[][] = []; let complex = false; let sheets: string[] = [];
    try {
      ({ rows: parsed, colorHints: hints, metadata, rawGrid, isComplex: complex, sheetNames: sheets } = await parseFile(file));
      setRows(parsed); setColorHints(hints); setAiMetadata(metadata);
      setIsComplex(complex); setSheetNames(sheets); setFileName(file.name);
    } catch {
      setError("Could not parse file. Make sure it's a valid CSV or XLSX."); return;
    }
    setNormalizing(true);
    try {
      const res = await fetch("/api/import/ai-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed, colorHints: hints, type: tab, knownMetadata: metadata, rawGrid, isComplex: complex }),
      });
      const data = await res.json();
      if (res.ok) {
        setRows(data.rows); setAiNormalized(true);
        setAiWarnings(data.warnings ?? []); setAiMetadata(data.metadata ?? {});
      }
    } catch { /* silent */ } finally { setNormalizing(false); }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0]; if (file) loadFile(file);
  }, [tab]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) loadFile(file); e.target.value = "";
  }

  function switchTab(t: TabId) {
    setTab(t); setRows([]); setFileName(""); setColorHints([]); setAiNormalized(false);
    setAiWarnings([]); setAiMetadata({}); setIsComplex(false); setSheetNames([]);
    setResults(null); setError(""); setSelectedBudgetId("");
  }

  function handleDeleteRows(indices: number[]) {
    const idxSet = new Set(indices);
    setRows(rows.filter((_, i) => !idxSet.has(i)));
  }

  async function runImport() {
    if (!rows.length) return;
    setImporting(true); setResults(null); setError("");
    const endpoint = tab === "requests" ? "/api/import" : tab === "budgets" ? "/api/import/budgets" : "/api/import/members";
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, metadata: aiMetadata, ...(tab === "requests" && selectedBudgetId ? { forceBudgetId: selectedBudgetId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed"); return; }
      setResults(data.results);
      if (data.results.imported > 0) setRows([]);
    } catch { setError("Network error. Please try again."); }
    finally { setImporting(false); }
  }

  return (
    <div>
      <Header title="Import Data" subtitle="Bulk import requests, budgets, and members from spreadsheets" />
      <div className="p-6 max-w-6xl space-y-5">

        <Walkthrough />

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["requests", "budgets", "members"] as TabId[]).map(t => {
            if (t === "budgets" && !canImportBudgets) return null;
            if (t === "members" && !canImportMembers) return null;
            if (t === "requests" && !isAdmin && !isOrgLead) return null;
            return (
              <button key={t} onClick={() => switchTab(t)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-navy text-navy" : "border-transparent text-ink-muted hover:text-ink"}`}>
                {TAB_LABELS[t]}
              </button>
            );
          })}
        </div>

        <div className="card p-6 space-y-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-ink-secondary">{TAB_DESCRIPTIONS[tab]}</p>
            <button onClick={() => downloadTemplate(tab)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs font-medium text-ink-secondary hover:bg-paper transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download template
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !fileName && fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragging ? "border-navy bg-navy/5" : fileName ? "border-border bg-paper/30" : "cursor-pointer border-border hover:border-navy/50 hover:bg-paper"}`}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} className="hidden" />
            {normalizing ? (
              <p className="text-sm font-medium text-navy flex items-center gap-2 justify-center">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Analyzing with AI…
              </p>
            ) : fileName ? (
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <p className="text-sm font-medium text-navy">{fileName}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {sheetNames.length > 1 ? `${sheetNames.length} sheets: ${sheetNames.join(", ")}` : sheetNames[0] ?? ""}
                  </p>
                </div>
                <button onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                  className="text-xs text-navy hover:underline">Replace file</button>
              </div>
            ) : (
              <>
                <svg className="w-7 h-7 text-ink-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-medium text-ink">Drop a file here or click to upload</p>
                <p className="text-xs text-ink-muted mt-1">CSV or XLSX · All sheets parsed · AI normalizes automatically</p>
              </>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Preview / edit section */}
          {rows.length > 0 && (
            <div className="space-y-3">
              {/* Status bar */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  Edit before importing — {rows.length} row{rows.length !== 1 ? "s" : ""}
                </p>
                {aiNormalized && !isComplex && <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">✦ AI normalized</span>}
                {aiNormalized && isComplex && <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-0.5">✦ Multi-table / multi-sheet — AI merged {rows.length} items</span>}
              </div>

              {/* Detected metadata */}
              {Object.keys(aiMetadata).filter(k => aiMetadata[k]).length > 0 && (
                <div className="px-3 py-2 bg-navy/5 border border-navy/20 rounded text-xs text-ink space-y-0.5">
                  <p className="font-semibold text-navy mb-1">Detected from spreadsheet</p>
                  {aiMetadata.organization && <p>Organization: <strong>{aiMetadata.organization}</strong></p>}
                  {aiMetadata.category && <p>Category: <strong>{aiMetadata.category}</strong></p>}
                  {aiMetadata.budget_total && <p>Total requested: <strong>${aiMetadata.budget_total}</strong></p>}
                  {aiMetadata.cost_center && <p>Cost center: <strong>{aiMetadata.cost_center}</strong></p>}
                  {aiMetadata.project_number && <p>Project number: <strong>{aiMetadata.project_number}</strong></p>}
                  {aiMetadata.fiscal_year && <p>Fiscal year: <strong>{aiMetadata.fiscal_year}</strong></p>}
                </div>
              )}

              {/* AI warnings */}
              {aiWarnings.length > 0 && (
                <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-0.5">
                  {aiWarnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}

              {/* Editable grid */}
              <EditableGrid rows={rows} cols={cols} onChange={setRows} onDeleteRows={handleDeleteRows} />

              {/* Budget selector */}
              {tab === "requests" && availableBudgets.length > 0 && (
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-sm font-medium text-ink whitespace-nowrap">Assign to budget:</label>
                  <select
                    value={selectedBudgetId}
                    onChange={e => setSelectedBudgetId(e.target.value)}
                    className="flex-1 border border-border rounded px-2 py-1.5 text-sm bg-white text-ink focus:outline-none focus:ring-1 focus:ring-navy"
                  >
                    <option value="">— auto-detect from spreadsheet —</option>
                    {availableBudgets.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={runImport} disabled={importing}
                  className="px-5 py-2 bg-navy text-white text-sm font-semibold rounded-md hover:bg-navy-light disabled:opacity-60">
                  {importing ? "Importing…" : `Import ${rows.length} row${rows.length !== 1 ? "s" : ""}`}
                </button>
                <button onClick={() => { setRows([]); setFileName(""); setSheetNames([]); setColorHints([]); setAiNormalized(false); setAiWarnings([]); setSelectedBudgetId(""); setIsComplex(false); }}
                  className="px-4 py-2 border border-border rounded-md text-sm text-ink-secondary hover:bg-paper">
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
                  {results.errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
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
