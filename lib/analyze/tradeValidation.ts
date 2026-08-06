export function checkRules(trade: any) {
  const violations: string[] = []
  if (!trade) return violations

  // Sample rules - these should come from user's actual rules
  const rules = {
    maxFloat: 10_000_000,
    minPrice: 2,
    maxPrice: 10,
    tradeBefore9AM: true,
    allowedTickers: ["AAPL", "TSLA", "NVDA", "AMZN", "GOOGL", "MSFT", "META", "NFLX"]
  }

  if (trade.ticker && !rules.allowedTickers.includes(trade.ticker))
    violations.push("Ticker not in watchlist")

  if (trade.price !== undefined) {
    const price = Number(trade.price)
    if (price < rules.minPrice) violations.push(`Price below $${rules.minPrice}`)
    if (price > rules.maxPrice) violations.push(`Price above $${rules.maxPrice}`)
  }

  return violations
}