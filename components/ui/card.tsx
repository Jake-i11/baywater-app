import * as React from "react"

import { cn } from "@/lib/utils"

function Card({
  className,
  children,
  sentiment = "neutral",
  ...props
}: React.ComponentProps<"div"> & { sentiment?: "profit" | "loss" | "neutral" | "accent" }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-card bg-card-bg p-4 text-sm text-text-primary ring-1 ring-card-border shadow-card",
        {
          "border-t-4 border-profit-green": sentiment === "profit",
          "border-t-4 border-loss-red": sentiment === "loss",
          "border-t-4 border-accent": sentiment === "accent",
          "border-t-4 border-transparent": sentiment === "neutral"
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header grid auto-rows-min items-start gap-1 px-0 pb-0",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-base font-semibold leading-snug text-text-primary",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-text-muted", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-0", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-card border-t border-card-border bg-card-bg/50 p-4",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}