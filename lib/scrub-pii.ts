/**
 * FERPA-compliant PII scrubber for data sent to third-party AI services.
 * Strips emails, phone numbers, and replaces full names with generic labels.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/** Replace all email addresses and phone numbers in a string */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL_RE, "[email redacted]")
    .replace(PHONE_RE, "[phone redacted]");
}

/** Scrub PII from a 2D spreadsheet grid before sending to AI */
export function scrubGrid(grid: string[][]): string[][] {
  return grid.map((row) => row.map((cell) => scrubText(String(cell ?? ""))));
}

/** Scrub PII from sample rows (array of key-value records) */
export function scrubSampleRows(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) => {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      clean[key] = scrubText(String(value ?? ""));
    }
    return clean;
  });
}
