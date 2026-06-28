import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }) {
  return <span className={cn("ui-badge", className)} {...props}>{children}</span>;
}
