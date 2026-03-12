import { cn } from "@/lib/utils";

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children, className }: TableProps) {
  return (
    <thead className={cn("border-b border-border bg-paper/50", className)}>
      {children}
    </thead>
  );
}

export function Tbody({ children, className }: TableProps) {
  return (
    <tbody className={cn("divide-y divide-border", className)}>
      {children}
    </tbody>
  );
}

interface ThProps {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

export function Th({ children, className, align = "left" }: ThProps) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-2xs font-semibold tracking-widest uppercase text-ink-muted",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  );
}

interface TdProps {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

export function Td({ children, className, align = "left" }: TdProps) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm text-ink",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

interface TrProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Tr({ children, className, onClick }: TrProps) {
  return (
    <tr
      className={cn(
        "transition-colors duration-100",
        onClick && "cursor-pointer hover:bg-paper",
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}
