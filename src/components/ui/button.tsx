import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-transparent bg-clip-padding active:scale-[0.99]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border-slate-200/90 dark:border-slate-800 bg-card text-foreground shadow-sm hover:border-primary/40 hover:bg-blue-50/70 hover:text-primary dark:hover:bg-primary/10 dark:hover:text-blue-300",
        secondary:
          "bg-muted text-foreground hover:bg-muted/80",
        ghost:
          "text-slate-600 dark:text-slate-300 hover:bg-slate-100/90 hover:text-foreground dark:hover:bg-slate-800/80 dark:hover:text-white",
        cta:
          "rounded-full bg-gradient-to-r from-[#174ec4] via-[#1f62e8] to-[#2e78f6] text-white shadow-[0_8px_20px_-6px_rgba(29,99,237,0.55)] hover:brightness-105",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-xl px-3.5 text-xs",
        lg: "h-11 rounded-full px-6 text-sm",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
