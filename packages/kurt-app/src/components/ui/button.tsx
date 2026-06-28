import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

type ButtonVariant = "default" | "ghost" | "nav" | "danger";
type ButtonSize = "sm" | "md" | "icon";

export function Button({ className, variant = "default", size = "md", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}) {
  return (
    <button type="button" className={cn("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className)} {...props}>
      {children}
    </button>
  );
}
