"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StatusBannerProps {
  type?: "error" | "warning" | "success" | "info";
  children: ReactNode;
}

export function StatusBanner({ type = "info", children }: StatusBannerProps) {
  const base =
    "rounded-xs border p-2 text-xs font-medium flex items-center gap-2";

  const variant = {
    error: "border-red-600/40 bg-red-600/10 text-red-600",
    warning: "border-yellow-600/40 bg-yellow-600/10 text-yellow-600",
    success: "border-emerald-600/40 bg-emerald-600/10 text-emerald-600",
    info: "border-sky-600/40 bg-sky-600/10 text-sky-600",
  }[type];

  return <div className={cn(base, variant)}>{children}</div>;
}
