import { RequestStatus, STATUS_LABELS, STATUS_COLORS, cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: RequestStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "stamp-badge",
        STATUS_COLORS[status],
        size === "sm" && "text-2xs px-2 py-0.5"
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
