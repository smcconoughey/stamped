"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

interface ImportResults {
  imported: number;
  skipped: number;
  errors: string[];
}

interface EmailScrapeResult {
  foundItems: Array<{
    description: string;
    status: string;
    orderNumber?: string;
    vendor?: string;
    estimatedDelivery?: string;
  }>;
  summary: string;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    if (values.every((v) => !v)) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || "";
    });
    rows.push(row);
  }

  return rows;
}

export default function ImportPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const router = useRouter();
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user?.role);

  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);

  const [emailText, setEmailText] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<EmailScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  if (!isAdmin) {
    router.push("/");
    return null;
  }

  async function handleCSVImport() {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResults(null);

    try {
      const rows = parseCSV(csvText);
      if (rows.length === 0) {
        setImportResults({ imported: 0, skipped: 0, errors: ["No valid rows found in CSV"] });
        return;
      }

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const data = await res.json();
      setImportResults(data.results);
    } catch (err) {
      setImportResults({
        imported: 0,
        skipped: 0,
        errors: ["Network error: " + (err instanceof Error ? err.message : "Unknown")],
      });
    } finally {
      setImporting(false);
    }
  }

  async function handleEmailScrape() {
    if (!emailText.trim()) return;
    setScraping(true);
    setScrapeResults(null);
    setScrapeError(null);

    try {
      const res = await fetch("/api/email/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailContent: emailText }),
      });

      if (!res.ok) {
        setScrapeError("Failed to process email. Please try again.");
        return;
      }

      const data = await res.json();
      setScrapeResults(data);
    } catch {
      setScrapeError("Network error. Please try again.");
    } finally {
      setScraping(false);
    }
  }

  return (
    <div>
      <Header
        title="Import Data"
        subtitle="Bulk import requests from CSV or extract status from emails"
      />

      <div className="p-6 max-w-3xl space-y-8">
        {/* CSV Import */}
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">CSV Bulk Import</h2>
            <p className="text-sm text-ink-secondary mt-0.5">
              Paste a CSV with columns: organization, title, justification, advisor_email, vendor, quantity,
              unit_price, url, priority, needed_by
            </p>
          </div>

          <div className="bg-paper rounded-md p-3 text-xs font-mono text-ink-secondary overflow-x-auto">
            organization,title,justification,advisor_email,quantity,unit_price,url,priority
            <br />
            Robotics Club,Arduino Mega,For robot build,prof@uni.edu,5,45.00,https://digikey.com,HIGH
          </div>

          <Textarea
            placeholder="Paste your CSV data here..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />

          {csvText.trim() && (
            <p className="text-xs text-ink-muted">
              {parseCSV(csvText).length} row(s) detected
            </p>
          )}

          <Button
            variant="primary"
            onClick={handleCSVImport}
            disabled={importing || !csvText.trim()}
          >
            {importing ? "Importing..." : "Import CSV"}
          </Button>

          {importResults && (
            <div
              className={`rounded-md border p-4 ${
                importResults.errors.length > 0
                  ? "bg-amber-50 border-amber-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <p className="text-sm font-semibold text-ink mb-1">Import Results</p>
              <p className="text-sm text-ink-secondary">
                Imported: <strong>{importResults.imported}</strong> &nbsp;|&nbsp; Skipped:{" "}
                <strong>{importResults.skipped}</strong>
              </p>
              {importResults.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {importResults.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-700">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email Scraper */}
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Email Status Extractor</h2>
            <p className="text-sm text-ink-secondary mt-0.5">
              Paste an email from a vendor or advisor. The AI will extract order status, tracking info, and
              delivery details.
            </p>
          </div>

          <Textarea
            placeholder="Paste email content here..."
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            rows={8}
          />

          <Button
            variant="primary"
            onClick={handleEmailScrape}
            disabled={scraping || !emailText.trim()}
          >
            {scraping ? "Analyzing Email..." : "Extract Status Info"}
          </Button>

          {scrapeError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-800">{scrapeError}</p>
            </div>
          )}

          {scrapeResults && (
            <div className="rounded-md border border-border bg-paper p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">
                  Summary
                </p>
                <p className="text-sm text-ink">{scrapeResults.summary}</p>
              </div>

              {scrapeResults.foundItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
                    Found Items ({scrapeResults.foundItems.length})
                  </p>
                  <div className="space-y-2">
                    {scrapeResults.foundItems.map((item, i) => (
                      <div key={i} className="bg-white border border-border rounded p-3 text-sm">
                        <p className="font-medium text-ink">{item.description}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-secondary">
                          <span>
                            Status: <strong>{item.status}</strong>
                          </span>
                          {item.vendor && <span>Vendor: {item.vendor}</span>}
                          {item.orderNumber && <span>Order #: {item.orderNumber}</span>}
                          {item.estimatedDelivery && (
                            <span>Est. Delivery: {item.estimatedDelivery}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
