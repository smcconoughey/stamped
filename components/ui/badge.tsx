import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "muted";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "stamp-badge",
        {
          "bg-gray-100 text-gray-700 border-gray-200": variant === "default",
          "bg-green-50 text-green-800 border-green-200": variant === "success",
          "bg-amber-50 text-amber-800 border-amber-200": variant === "warning",
          "bg-red-50 text-red-800 border-red-200": variant === "danger",
          "bg-blue-50 text-blue-800 border-blue-200": variant === "info",
          "bg-gray-50 text-gray-500 border-gray-100": variant === "muted",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
