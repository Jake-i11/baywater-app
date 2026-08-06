export function parseCSVContent(content: string): any[] {
  const lines = content.split('\n').filter(line => line.trim() !== '')
  if (lines.length <= 1) return []

  const rawHeaders = parseCSVLine(lines[0])
  const colMap = buildColumnMapping(rawHeaders)

  console.log('[CSV Debug] Raw headers:', rawHeaders)
  console.log('[CSV Debug] Normalized column mapping:', colMap)

  if (colMap['ticker'] === undefined) {
    console.error('[CSV Debug] Missing ticker/symbol column. Headers found:', rawHeaders)
    return []
  }

  const hasPriceData = colMap['price'] !== undefined || colMap['entry_price'] !== undefined
  if (!hasPriceData) {
    console.error('[CSV Debug] Missing price/entry column.')
    return []
  }

  const execFormat = isExecutionFormat(colMap)
  if (execFormat) {
    return parseExecutionCSVLines(lines, rawHeaders, colMap)
  } else {
    return parseSimpleTradeCSVLines(lines, rawHeaders, colMap)
  }
}

function isExecutionFormat(colMap: Record<string, number>): boolean {
  const hasDirection = colMap['side'] !== undefined
  const hasPrice = colMap['price'] !== undefined
  const hasEntryPrice = colMap['entry_price'] !== undefined
  const hasExitPrice = colMap['exit_price'] !== undefined

  if (hasDirection && hasPrice && !hasEntryPrice && !hasExitPrice) return true
  if (!hasEntryPrice && hasPrice) return true
  return false
}

function parseExecutionCSVLines(lines: string[], rawHeaders: string[], colMap: Record<string, number>): any[] {
  const orderDateIdx = rawHeaders.findIndex(h => normalizeHeaderName(h) === 'order_date')
  const transactionDateIdx = rawHeaders.findIndex(h => normalizeHeaderName(h) === 'transaction_date')
  const cancelReasonIdx = rawHeaders.findIndex(h => normalizeHeaderName(h) === 'cancel_reason')

  const executions: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < rawHeaders.length) continue

    const ticker = values[colMap['ticker']]?.trim() || ''
    const direction = colMap['side'] !== undefined ? (values[colMap['side']]?.trim() || '') : ''

    let priceStr = ''
    if (colMap['price'] !== undefined) {
      priceStr = values[colMap['price']]?.trim() || ''
    } else if (colMap['entry_price'] !== undefined) {
      priceStr = values[colMap['entry_price']]?.trim() || ''
    }

    let sizeStr = ''
    if (colMap['size'] !== undefined) {
      sizeStr = values[colMap['size']]?.trim() || ''
    }

    let timestampStr = ''
    if (transactionDateIdx !== -1) {
      timestampStr = values[transactionDateIdx]?.trim() || ''
    } else if (orderDateIdx !== -1) {
      timestampStr = values[orderDateIdx]?.trim() || ''
    } else if (colMap['entry_time'] !== undefined) {
      timestampStr = values[colMap['entry_time']]?.trim() || ''
    }

    const cancelReason = cancelReasonIdx !== -1 ? (values[cancelReasonIdx]?.trim() || '') : ''

    if (!ticker || !sizeStr || !priceStr) continue

    const cleanSize = sizeStr.replace(/[",]/g, '')
    const cleanPrice = priceStr.replace(/[^\d.]/g, '')

    let tradeTime: Date
    if (timestampStr) {
      tradeTime = parseBrokerageTimestamp(timestampStr)
    } else {
      tradeTime = new Date()
    }

    executions.push({
      ticker,
      direction,
      size: cleanSize,
      price: cleanPrice,
      timestamp: tradeTime.toISOString(),
      rawAmount: sizeStr,
      rawPrice: priceStr,
      cancelReason
    })
  }

  return pairExecutionsIntoTrades(executions)
}

function parseSimpleTradeCSVLines(lines: string[], rawHeaders: string[], colMap: Record<string, number>): any[] {
  const trades: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length < rawHeaders.length) continue

    const ticker = values[colMap['ticker']]?.trim() || ''

    let entryPrice: number | null = null
    if (colMap['entry_price'] !== undefined) {
      entryPrice = parseNumeric(values[colMap['entry_price']])
    }

    let exitPrice: number | null = null
    if (colMap['exit_price'] !== undefined) {
      exitPrice = parseNumeric(values[colMap['exit_price']])
    }

    let size: number | null = null
    if (colMap['size'] !== undefined) {
      size = parseNumeric(values[colMap['size']])
    }

    let entryTime: string | null = null
    if (colMap['entry_time'] !== undefined) {
      entryTime = values[colMap['entry_time']]?.trim() || null
    }

    let date: string | null = null
    if (colMap['date'] !== undefined) {
      date = values[colMap['date']]?.trim() || null
    }

    let exitTime: string | null = null
    if (colMap['exit_time'] !== undefined) {
      exitTime = values[colMap['exit_time']]?.trim() || null
    }

    let realizedPl: number | null = null
    if (colMap['realized_pl'] !== undefined) {
      realizedPl = parseNumeric(values[colMap['realized_pl']])
    }

    let direction: string = 'long'
    if (colMap['side'] !== undefined) {
      const rawSide = values[colMap['side']]?.trim().toLowerCase() || ''
      if (rawSide === 'short' || rawSide === 'sell') {
        direction = 'short'
      } else {
        direction = 'long'
      }
    }

    if (!ticker) continue
    if (entryPrice === null && exitPrice === null && size === null) continue

    const trade: any = {
      ticker,
      direction,
      entry_price: entryPrice?.toFixed(2) || null,
      exit_price: exitPrice?.toFixed(2) || null,
      size: size?.toString() || '0',
      entry_time: entryTime,
      exit_time: exitTime,
      date,
      realized_pl: realizedPl?.toFixed(2) || null,
      created_at: new Date().toISOString()
    }

    const entryTimeHasDate = entryTime ? /\d{4}-\d{2}-\d{2}/.test(entryTime) : false

    if (entryTime && entryTimeHasDate) {
      trade.timestamp = entryTime
    } else if (date && entryTime) {
      trade.timestamp = `${date} ${entryTime}`
    } else if (entryTime) {
      trade.timestamp = entryTime
    } else if (date) {
      trade.timestamp = date
    } else {
      trade.timestamp = null
    }

    trades.push(trade)
  }

  return trades
}

function pairExecutionsIntoTrades(executions: any[]): any[] {
  const validExecutions = executions.filter(exec => {
    const hasCancelReason = exec.cancelReason && exec.cancelReason.trim() !== ''
    return !hasCancelReason
  })

  if (validExecutions.length === 0) return []

  const byTicker: Record<string, any[]> = {}
  validExecutions.forEach(exec => {
    if (!byTicker[exec.ticker]) byTicker[exec.ticker] = []
    byTicker[exec.ticker].push(exec)
  })

  const completedTrades: any[] = []

  for (const [ticker, tickerExecs] of Object.entries(byTicker)) {
    const sortedExecs = [...tickerExecs].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    let position: {
      direction: 'short' | 'long'
      openQuantity: number
      totalCost: number
      firstTimestamp: string
    } | null = null

    for (const exec of sortedExecs) {
      const quantity = parseFloat(exec.size)
      const price = parseFloat(exec.price)
      const direction = exec.direction.toLowerCase()

      if (direction === 'short' || direction === 'buy') {
        if (!position) {
          position = {
            direction: direction === 'short' ? 'short' : 'long',
            openQuantity: 0,
            totalCost: 0,
            firstTimestamp: exec.timestamp,
          }
        }
        position.openQuantity += quantity
        position.totalCost += quantity * price
      } else if (direction === 'cover' || direction === 'sell') {
        if (!position || position.openQuantity <= 0) {
          console.warn(`[Position Tracker] ${ticker} - cover/sell with no open position, skipping`)
          continue
        }

        const closeQuantity = Math.min(quantity, position.openQuantity)
        const avgEntryPrice = position.totalCost / position.openQuantity

        let realizedPL = 0
        if (position.direction === 'short') {
          realizedPL = (avgEntryPrice - price) * closeQuantity
        } else {
          realizedPL = (price - avgEntryPrice) * closeQuantity
        }

        const positionFullyClosed = closeQuantity >= position.openQuantity
        const status = positionFullyClosed ? 'CLOSED' : 'PARTIAL'

        const side = position.direction.toUpperCase()

        const completedTrade = {
          ticker,
          side,
          direction: position.direction,
          entry_price: avgEntryPrice.toFixed(2),
          exit_price: price.toFixed(2),
          size: closeQuantity.toString(),
          quantity: closeQuantity.toString(),
          entry_time: position.firstTimestamp,
          exit_time: exec.timestamp,
          timestamp: position.firstTimestamp,
          realized_pl: realizedPL.toFixed(2),
          status,
          created_at: new Date().toISOString()
        }

        completedTrades.push(completedTrade)

        if (!positionFullyClosed) {
          position.openQuantity -= closeQuantity
          position.totalCost -= closeQuantity * avgEntryPrice
        } else {
          position = null
        }
      }
    }

    if (position && position.openQuantity > 0) {
      const avgEntryPrice = position.totalCost / position.openQuantity
      const side = position.direction.toUpperCase()

      const openTrade = {
        ticker,
        side,
        direction: position.direction,
        entry_price: avgEntryPrice.toFixed(2),
        exit_price: null,
        size: position.openQuantity.toString(),
        quantity: position.openQuantity.toString(),
        entry_time: position.firstTimestamp,
        exit_time: null,
        timestamp: position.firstTimestamp,
        realized_pl: null,
        status: 'OPEN',
        created_at: new Date().toISOString()
      }

      completedTrades.push(openTrade)
    }
  }

  return completedTrades
}

function normalizeHeaderName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function parseBrokerageTimestamp(timestamp: string): Date {
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

export function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let currentValue = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      i++
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim())
      currentValue = ''
      i++
    } else {
      currentValue += char
      i++
    }
  }
  values.push(currentValue.trim())
  return values.map(v => v.replace(/^"|"$/g, ''))
}

export function buildColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const headerAliases: Record<string, string> = {
    ticker: 'ticker', symbol: 'ticker', security: 'ticker', instrument: 'ticker',
    side: 'side', type: 'side', action: 'side', direction: 'side',
    entry: 'entry_price', entry_price: 'entry_price', entryprice: 'entry_price',
    avg_price: 'entry_price', avgprice: 'entry_price',
    buy_price: 'entry_price', buyprice: 'entry_price',
    open: 'entry_price', open_price: 'entry_price',
    exit: 'exit_price', exit_price: 'exit_price', exitprice: 'exit_price',
    close_price: 'exit_price', closeprice: 'exit_price',
    sell_price: 'exit_price', sellprice: 'exit_price',
    close: 'exit_price',
    price: 'price',
    quantity: 'size', size: 'size', shares: 'size', qty: 'size', amount: 'size',
    pnl: 'realized_pl', p_l: 'realized_pl', realized_pl: 'realized_pl', pl: 'realized_pl',
    profit_loss: 'realized_pl',
    time: 'entry_time', entry_time: 'entry_time', entrytime: 'entry_time', timestamp: 'entry_time',
    date: 'date',
    exit_time: 'exit_time', exittime: 'exit_time',
    cancel_reason: 'cancel_reason', cancelreason: 'cancel_reason',
    order_date: 'order_date',
    transaction_date: 'transaction_date'
  }

  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeaderName(headers[i])
    const canonical = headerAliases[normalized]
    if (canonical && mapping[canonical] === undefined) {
      mapping[canonical] = i
    }
  }
  return mapping
}

export function parseNumeric(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null
  const cleaned = value.trim().replace(/[$,]/g, '')
  const num = Number(cleaned)
  return isNaN(num) ? null : num
}