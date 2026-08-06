/**
 * Calculate hold time in minutes (for database storage)
 * Returns null for open trades or invalid data
 */
export function computeHoldTime(entryTime: string | null | undefined, exitTime: string | null | undefined): number | null {
  if (!entryTime || !exitTime) return null

  const entryMs = new Date(entryTime).getTime()
  const exitMs = new Date(exitTime).getTime()

  if (isNaN(entryMs) || isNaN(exitMs)) return null

  const diffMs = exitMs - entryMs
  if (diffMs < 0) return null

  return Math.round(diffMs / 60000) // Return total minutes as integer
}

/**
 * Format hold time for display (kept for UI purposes)
 */
export function formatHoldTime(holdTimeMinutes: number | null): string {
  if (holdTimeMinutes === null) return "Open trade"

  if (holdTimeMinutes < 1) return "<1m"
  if (holdTimeMinutes < 60) return `${holdTimeMinutes}m`

  const hours = Math.floor(holdTimeMinutes / 60)
  const minutes = holdTimeMinutes % 60

  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function computePLValue(trade: { entry_price: string | null | undefined; exit_price: string | null | undefined; size: string | null | undefined; direction?: string }): number | null {
  const entry = trade.entry_price ? parseFloat(trade.entry_price) : null
  const exit = trade.exit_price ? parseFloat(trade.exit_price) : null
  const size = trade.size ? parseFloat(trade.size) : null

  if (entry === null || exit === null || size === null) return null

  const isShort = trade.direction?.toLowerCase() === 'short'

  if (isShort) {
    return (entry - exit) * size
  } else {
    return (exit - entry) * size
  }
}

export function normalizeSide(direction: string | undefined | null): string {
  const d = (direction || '').toLowerCase()
  if (d === 'short' || d === 'sell') return 'SHORT'
  return 'LONG'
}

export function parseTradeTime(timeStr: string | null | undefined): Date | null {
  if (!timeStr || typeof timeStr !== 'string' || timeStr.trim() === '') {
    return null
  }

  const trimmed = timeStr.trim()

  if (trimmed === 'Invalid Date') {
    return null
  }

  const now = new Date()
  let hours = 0
  let minutes = 0
  let isPM = false

  const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (match) {
    hours = parseInt(match[1], 10)
    minutes = match[2] ? parseInt(match[2], 10) : 0
    isPM = (match[3]?.toUpperCase() === 'PM')

    if (isPM && hours < 12) hours += 12
    if (!isPM && hours === 12) hours = 0
  }

  const tradeDate = new Date(now)
  tradeDate.setHours(hours, minutes, 0, 0)

  return tradeDate
}

/**
 * Parse brokerage timestamp format (e.g., "6/12/26 9:46a ET")
 * Returns Date object in local timezone
 */
export function parseBrokerageTimestamp(timestamp: string): Date {
  const cleanTimestamp = timestamp.replace(/\s*(ET|CT|MT|PT)$/i, '').trim()

  const match = cleanTimestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})([ap])/i)
  if (!match) {
    console.warn(`Could not parse timestamp: ${timestamp}`)
    return new Date()
  }

  const [, month, day, year, hour, minute, period] = match
  const fullYear = 2000 + parseInt(year, 10)

  let hours = parseInt(hour, 10)
  if (period.toLowerCase() === 'p' && hours < 12) hours += 12
  if (period.toLowerCase() === 'a' && hours === 12) hours = 0

  return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10), hours, parseInt(minute, 10), 0, 0)
}
