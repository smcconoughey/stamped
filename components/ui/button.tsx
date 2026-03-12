import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "stamp";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed",
          {
            "bg-navy text-white hover:bg-navy-light": variant === "primary",
            "bg-white text-ink border border-border hover:bg-paper": variant === "secondary",
            "bg-red-600 text-white hover:bg-red-700": variant === "danger",
            "text-ink-secondary hover:text-ink hover:bg-paper": variant === "ghost",
            "bg-stamp text-white hover:bg-stamp-light": variant === "stamp",
          },
          {
            "px-3 py-1.5 text-xs": size === "sm",
            "px-4 py-2 text-sm": size === "md",
            "px-5 py-2.5 text-base": size === "lg",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
