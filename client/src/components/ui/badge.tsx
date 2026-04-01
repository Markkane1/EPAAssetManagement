/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-auto max-w-full min-w-0 shrink items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-center text-[11px] font-semibold uppercase leading-[1.15rem] tracking-[0.12em] whitespace-normal break-words [overflow-wrap:anywhere] [word-break:break-word] flex-wrap transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/85",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline: "border-border/80 bg-white text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
