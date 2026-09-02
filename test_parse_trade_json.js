/**
 * Tests for lib/analyze/parseTradeJson.ts
 * Run with: npx ts-node --project tsconfig.test.json test_parse_trade_json.js
 */
const { extractTradeJson, resolveTradePrices, resolveSidePrice } = require("./lib/analyze/parseTradeJson");

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("=== TEST A: Normal valid JSON ===");
{
  const raw = `{"ticker":"AAPL","entry":"1.47","exit":"1.45","size":"68","time":"07/01/26 13:42:47 EDT","exit_time":"07/01/26 14:18:32 EDT"}`;
  const r = extractTradeJson(raw);
  check("parses", r.ok, true);
  check("ticker", r.trade?.ticker, "AAPL");
  resolveTradePrices(r.trade);
  check("entry unchanged", r.trade.entry, "1.47");
}

console.log("=== TEST B: JSON wrapped in ```json fences ===");
{
  const raw = "```json\n{\"ticker\":\"AAPL\",\"entry\":\"1.47\",\"exit\":\"1.45\",\"size\":\"68\",\"time\":\"07/01/26 13:42:47 EDT\",\"exit_time\":\"07/01/26 14:18:32 EDT\"}\n```";
  const r = extractTradeJson(raw);
  check("parses fenced json", r.ok, true);
  check("ticker", r.trade?.ticker, "AAPL");
}

console.log("=== TEST C: JSON surrounded by explanatory text ===");
{
  const raw = "Here is the extracted trade data:\n{\"ticker\":\"AAPL\",\"entry\":\"1.47\",\"exit\":\"1.45\",\"size\":\"68\"}\nLet me know if you need more.";
  const r = extractTradeJson(raw);
  check("parses with prose", r.ok, true);
  check("ticker", r.trade?.ticker, "AAPL");
}

console.log("=== TEST C2: JSON inside ```json tag with prose before ===");
{
  const raw = "Sure, here you go:\n```json\n{\"ticker\":\"TSLA\",\"entry\":\"200.1\",\"exit\":\"210.5\",\"size\":\"10\"}\n```\nHope this helps!";
  const r = extractTradeJson(raw);
  check("parses", r.ok, true);
  check("ticker", r.trade?.ticker, "TSLA");
}

console.log("=== TEST C3: bare 'json' prefix line ===");
{
  const raw = "json\n{\"ticker\":\"NVDA\",\"entry\":\"120\",\"exit\":\"125\",\"size\":\"5\"}";
  const r = extractTradeJson(raw);
  check("parses bare json tag", r.ok, true);
  check("ticker", r.trade?.ticker, "NVDA");
}

console.log("=== TEST D: Fill price + Limit price → fill wins ===");
{
  const raw = JSON.stringify({
    ticker: "AAPL",
    entry: "1.50",            // model chose limit (wrong)
    entry_fill: "1.47",       // actual fill
    entry_limit: "1.50",
    exit: "1.46",             // model chose limit (wrong)
    exit_fill: "1.45",        // actual fill
    exit_limit: "1.46",
    size: "68",
    time: "07/01/26 13:42:47 EDT",
    exit_time: "07/01/26 14:18:32 EDT",
  });
  const r = extractTradeJson(raw);
  check("parses", r.ok, true);
  resolveTradePrices(r.trade);
  check("entry uses fill", r.trade.entry, "1.47");
  check("exit uses fill", r.trade.exit, "1.45");
}

console.log("=== TEST E: Limit-only → limit fallback ===");
{
  const raw = JSON.stringify({
    ticker: "AAPL",
    entry: "1.50",
    exit: "1.46",
    size: "68",
    time: "07/01/26 13:42:47 EDT",
    exit_time: "07/01/26 14:18:32 EDT",
  });
  const r = extractTradeJson(raw);
  check("parses", r.ok, true);
  resolveTradePrices(r.trade);
  check("entry falls back to limit", r.trade.entry, "1.50");
  check("exit falls back to limit", r.trade.exit, "1.46");
}

console.log("=== TEST E2: label variants recognized (Average Price / Avg Fill / Executed) ===");
{
  const raw = JSON.stringify({
    ticker: "AAPL",
    entry: "1.60",
    entry_average_price: "1.47",
    exit: "1.50",
    exit_executed_price: "1.45",
    size: "68",
  });
  const r = extractTradeJson(raw);
  check("parses", r.ok, true);
  resolveTradePrices(r.trade);
  check("entry uses average price", r.trade.entry, "1.47");
  check("exit uses executed price", r.trade.exit, "1.45");
}

console.log("=== TEST F: malformed / garbage responses ===");
{
  check("null content fails cleanly", extractTradeJson(null).ok, false);
  check("empty string fails cleanly", extractTradeJson("   ").ok, false);
  const safety = extractTradeJson("User Safety: safe");
  check("'User Safety: safe' fails cleanly", safety.ok, false);
  check("reason present", typeof safety.reason, "string");
  check("non-string content fails cleanly", extractTradeJson(42).ok, false);
}

console.log("=== TEST G: nested wrapper object ===");
{
  const raw = JSON.stringify({ trade: { ticker: "AAPL", entry: "1.47", exit: "1.45", size: "68" } });
  const r = extractTradeJson(raw);
  check("unwraps { trade: {...} }", r.ok, true);
  check("ticker", r.trade?.ticker, "AAPL");
}

console.log("=== TEST H: double-encoded JSON string ===");
{
  const inner = JSON.stringify({ ticker: "AAPL", entry: "1.47", exit: "1.45", size: "68" });
  const r = extractTradeJson(JSON.stringify(inner));
  check("unwraps double-encoded string", r.ok, true);
  check("ticker", r.trade?.ticker, "AAPL");
}

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);