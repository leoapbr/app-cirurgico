import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "destructive" | "success" }) {
  return (
    <div
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-4 py-3 text-sm",
        variant === "destructive" && "border-destructive/40 bg-destructive/10 text-destructive",
        variant === "success" && "border-primary/30 bg-primary/10",
        className,
      )}
      {...props}
    />
  );
}
