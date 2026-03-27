import * as React from "react";
import { cn } from "@/lib/utils";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function ToastViewport(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

export function Toast({
  className,
  open = true,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { open?: boolean }) {
  return (
    <div
      data-state={open ? "open" : "closed"}
      className={cn("rounded-lg border bg-background p-4 shadow-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function ToastTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h4 className={cn("text-sm font-semibold", className)} {...props} />;
}

export function ToastDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function ToastClose(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" aria-label="Close" {...props} />;
}
