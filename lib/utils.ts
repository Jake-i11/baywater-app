import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** P&L with sign and thousands separators: +$1,234.56 or -$1,234.56 */
export function formatPL(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === 'null') return "—"
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (isNaN(num)) return "—"
  const abs = Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (num >= 0) return `+$${abs}`
  return `-$${abs}`
}

/** Currency without sign: $1,234.56 */
export function formatCurrency(value: number): string {
  return `$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Integer or decimal with thousands separators */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US")
}

/** Percentage: 12.3% */
export function formatPercent(num: number, decimals = 1): string {
  return `${num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`
}

/** Ratio: 1.84 */
export function formatRatio(num: number, decimals = 2): string {
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
