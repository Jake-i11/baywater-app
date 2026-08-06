import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format P&L value with proper currency formatting and color indicators
 */
export function formatPL(value: string | null | undefined): string {
  if (value === null || value === undefined || value === 'null') return "\u2014"
  const num = parseFloat(value)
  if (isNaN(num)) return "\u2014"
  const sign = num >= 0 ? "+" : ""
  return `${sign}$${num.toFixed(2)}`
}

/**
 * Format number with commas for thousands
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US")
}
