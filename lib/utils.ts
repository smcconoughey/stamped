import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM d, yyyy");
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export type RequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "CANCELLED"
  | "ON_HOLD";

export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ORDERED: "Ordered",
  PARTIALLY_RECEIVED: "Partially Received",
  RECEIVED: "Received",
  READY_FOR_PICKUP: "Ready for Pickup",
  PICKED_UP: "Picked Up",
  CANCELLED: "Cancelled",
  ON_HOLD: "On Hold",
};

export const STATUS_COLORS: Record<RequestStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  SUBMITTED: "bg-blue-50 text-blue-800 border-blue-200",
  PENDING_APPROVAL: "bg-amber-50 text-amber-800 border-amber-200",
  APPROVED: "bg-green-50 text-green-800 border-green-200",
  REJECTED: "bg-red-50 text-red-800 border-red-200",
  ORDERED: "bg-purple-50 text-purple-800 border-purple-200",
  PARTIALLY_RECEIVED: "bg-teal-50 text-teal-800 border-teal-200",
  RECEIVED: "bg-teal-50 text-teal-800 border-teal-200",
  READY_FOR_PICKUP: "bg-emerald-50 text-emerald-800 border-emerald-200",
  PICKED_UP: "bg-gray-100 text-gray-600 border-gray-200",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-200",
  ON_HOLD: "bg-orange-50 text-orange-800 border-orange-200",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: "text-ink-muted",
  NORMAL: "text-ink-secondary",
  HIGH: "text-amber-700",
  URGENT: "text-red-700 font-semibold",
};

export function generateRequestNumber(prefix: string, num: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(num).padStart(4, "0")}`;
}

export const ADMIN_STATUSES: RequestStatus[] = [
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "READY_FOR_PICKUP",
];

export const ACTIVE_STATUSES: RequestStatus[] = [
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
];

export const ALL_STATUSES: RequestStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "CANCELLED",
  "ON_HOLD",
];

export const ALL_PRIORITIES: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
