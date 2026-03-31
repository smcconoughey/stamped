"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];

interface LineItem {
  id: string;
  name: string;
  quantity: string;
  unitPrice: string;
  url: string;
}

function newLineItem(): LineItem {
  return { id: Math.random().toString(36).slice(2), name: "", quantity: "1", unitPrice: "", url: "" };
}

export default function NewRequestPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;

  const [orgs, setOrgs] = useState<any[]>([]);
  const [orgBudgets, setOrgBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    organizationId: "",
    budgetId: "",
    title: "",
    description: "",
    justification: "",
    advisorEmail: "",
    advisorName: "",
    vendorName: "",
    vendorUrl: "",
    vendorNote: "",
    neededBy: "",
    priority: "NORMAL",
  });

  const [items, setItems] = useState<LineItem[]>([newLineItem()]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchOrgs();
  }, []);

  async function fetchOrgs() {
    try {
      // Fetch organizations via requests endpoint just to get orgs
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.organizations || []);
      }
    } catch {}
  }

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
    // When org changes, load its budgets
    if (key === "organizationId" && value) {
      fetch(`/api/organizations/${value}`)
        .then((r) => r.json())
        .then((d) => setOrgBudgets(d.organization?.budgets || []))
        .catch(() => setOrgBudgets([]));
      setForm((f) => ({ ...f, organizationId: value, budgetId: "" }));
    }
  }

  function updateItem(id: string, key: keyof LineItem, value: string) {
    setItems((items) => items.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  }

  function addItem() {
    setItems((items) => [...items, newLineItem()]);
  }

  function removeItem(id: string) {
    setItems((items) => items.filter((item) => item.id !== id));
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.organizationId) newErrors.organizationId = "Organization is required";
    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.justification.trim()) newErrors.justification = "Justification is required";
    if (!form.advisorEmail.trim()) newErrors.advisorEmail = "Advisor email is required";
    if (form.advisorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.advisorEmail)) {
      newErrors.advisorEmail = "Invalid email address";
    }

    for (const item of items) {
      if (!item.name.trim()) {
        newErrors.items = "All line items must have a name";
        break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const totalEstimated = items.reduce((sum, item) => {
    const price = parseFloat(item.unitPrice) || 0;
    const qty = parseInt(item.quantity) || 1;
    return sum + price * qty;
  }, 0);

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const newFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.size > MAX_FILE_SIZE) {
        setErrors((e) => ({ ...e, attachments: `"${file.name}" exceeds 10 MB limit` }));
        return;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setErrors((e) => ({ ...e, attachments: `"${file.name}" — unsupported type. Use PDF, PNG, JPG, WEBP, or GIF.` }));
        return;
      }
      newFiles.push(file);
    }
    setAttachments((prev) => [...prev, ...newFiles]);
    setErrors((e) => ({ ...e, attachments: "" }));
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleSubmit(submitNow: boolean) {
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: items.filter((i) => i.name.trim()),
          submitNow,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrors({ submit: data.error || "Failed to create request" });
        return;
      }

      const data = await res.json();

      // Upload attachments if any
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((file) => formData.append("files", file));
        await fetch(`/api/requests/${data.request.id}/attachments`, {
          method: "POST",
          body: formData,
        });
      }

      router.push(`/requests/${data.request.id}`);
    } catch {
      setErrors({ submit: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Header title="New Purchase Request" subtitle="Submit a purchase request for your organization" />

      <div className="p-6 max-w-3xl space-y-6">
        {errors.submit && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {errors.submit}
          </div>
        )}

        {/* Organization & Basic Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">
            Request Information
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Organization *"
              id="organizationId"
              value={form.organizationId}
              onChange={(e) => setField("organizationId", e.target.value)}
              error={errors.organizationId}
            >
              <option value="">Select organization...</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.code})
                </option>
              ))}
            </Select>

            {orgBudgets.length > 0 && (
              <Select
                label="Budget / Cost Center"
                id="budgetId"
                value={form.budgetId}
                onChange={(e) => setField("budgetId", e.target.value)}
              >
                <option value="">No budget selected</option>
                {orgBudgets.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.fiscalYear})
                  </option>
                ))}
              </Select>
            )}
          </div>

          <Input
            label="Request Title *"
            id="title"
            placeholder="Brief description of what you're purchasing"
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            error={errors.title}
          />

          <Textarea
            label="Description"
            id="description"
            placeholder="Additional details about the purchase (optional)"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={2}
          />

          <Textarea
            label="Justification *"
            id="justification"
            placeholder="Why does your organization need this? How will it be used?"
            value={form.justification}
            onChange={(e) => setField("justification", e.target.value)}
            rows={3}
            error={errors.justification}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priority"
              id="priority"
              value={form.priority}
              onChange={(e) => setField("priority", e.target.value)}
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>

            <Input
              label="Needed By Date"
              id="neededBy"
              type="date"
              value={form.neededBy}
              onChange={(e) => setField("neededBy", e.target.value)}
            />
          </div>
        </div>

        {/* Advisor Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">
            Faculty Advisor
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Advisor Email *"
              id="advisorEmail"
              type="email"
              placeholder="advisor@university.edu"
              value={form.advisorEmail}
              onChange={(e) => setField("advisorEmail", e.target.value)}
              error={errors.advisorEmail}
            />
            <Input
              label="Advisor Name"
              id="advisorName"
              placeholder="Prof. Smith"
              value={form.advisorName}
              onChange={(e) => setField("advisorName", e.target.value)}
            />
          </div>
        </div>

        {/* Vendor Info */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">
            Vendor Information (Optional)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Vendor Name"
              id="vendorName"
              placeholder="Amazon, DigiKey, McMaster-Carr..."
              value={form.vendorName}
              onChange={(e) => setField("vendorName", e.target.value)}
            />
            <Input
              label="Vendor URL"
              id="vendorUrl"
              placeholder="https://..."
              value={form.vendorUrl}
              onChange={(e) => setField("vendorUrl", e.target.value)}
            />
          </div>
          <Textarea
            label="Vendor Notes"
            id="vendorNote"
            placeholder="Any special notes about this vendor or ordering instructions..."
            value={form.vendorNote}
            onChange={(e) => setField("vendorNote", e.target.value)}
            rows={2}
          />
        </div>

        {/* Line Items */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-ink">Line Items</h2>
            <Button variant="secondary" size="sm" onClick={addItem} type="button">
              Add Item
            </Button>
          </div>

          {errors.items && (
            <p className="text-xs text-red-600">{errors.items}</p>
          )}

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="bg-paper rounded-md p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-muted">Item {index + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Item name *"
                  value={item.name}
                  onChange={(e) => updateItem(item.id, "name", e.target.value)}
                />
                <div className="grid grid-cols-3 gap-3">
                  <Input
                    placeholder="Qty"
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, "quantity", e.target.value)}
                  />
                  <Input
                    placeholder="Unit Price ($)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.id, "unitPrice", e.target.value)}
                  />
                  <div className="flex items-center">
                    <span className="text-sm text-ink-secondary">
                      {item.unitPrice && item.quantity
                        ? formatCurrency(parseFloat(item.unitPrice) * parseInt(item.quantity))
                        : "—"}
                    </span>
                  </div>
                </div>
                <Input
                  placeholder="Product URL (optional)"
                  value={item.url}
                  onChange={(e) => updateItem(item.id, "url", e.target.value)}
                />
              </div>
            ))}
          </div>

          {totalEstimated > 0 && (
            <div className="flex justify-end pt-2 border-t border-border">
              <div className="text-sm">
                <span className="text-ink-secondary">Estimated Total: </span>
                <span className="font-semibold text-ink">{formatCurrency(totalEstimated)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Attachments */}
        <div className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink border-b border-border pb-3">
            Attachments (Optional)
          </h2>
          <p className="text-xs text-ink-muted">Upload quotes, receipts, or supporting documents. Max 10 MB per file. PDF, PNG, JPG, WEBP, GIF accepted.</p>
          {errors.attachments && (
            <p className="text-xs text-red-600">{errors.attachments}</p>
          )}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              dragOver ? "border-navy bg-navy/5" : "border-border hover:border-ink-muted"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFilesSelected(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
              className="hidden"
              onChange={(e) => { handleFilesSelected(e.target.files); e.target.value = ""; }}
            />
            <svg className="mx-auto w-8 h-8 text-ink-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
            </svg>
            <p className="text-sm text-ink-secondary">Drag & drop files here or <span className="text-navy font-medium">browse</span></p>
          </div>
          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-paper rounded-md px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs">{ file.type === "application/pdf" ? "📄" : "🖼️" }</span>
                    <span className="text-sm text-ink truncate">{file.name}</span>
                    <span className="text-xs text-ink-muted flex-shrink-0">{formatFileSize(file.size)}</span>
                  </div>
                  <button type="button" onClick={() => removeAttachment(index)} className="text-xs text-red-600 hover:text-red-800 flex-shrink-0 ml-2">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={() => router.push("/requests")}
            disabled={loading}
            type="button"
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSubmit(false)}
            disabled={loading}
            type="button"
          >
            Save as Draft
          </Button>
          <Button
            variant="stamp"
            onClick={() => handleSubmit(true)}
            disabled={loading}
            type="button"
          >
            {loading ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
