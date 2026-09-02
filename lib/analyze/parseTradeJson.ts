/**
 * Robust parsing for the OpenRouter screenshot analysis response.
 *
 * The vision model sometimes wraps its JSON in markdown code fences, prefixes
 * it with a bare "json" tag, or surrounds it with short explanatory text.
 * This module extracts the trade object from those normal LLM output shapes,
 * and enforces the fill-price-over-limit-price priority in code.
 */

export interface ParseResult {
  ok: boolean;
  trade?: Record<string, any>;
  reason?: string;
}

/**
 * Extract the first plausible trade JSON object from the model's raw content.
 * Handles: plain JSON, markdown fences (```json / ``` / json tag) anywhere,
 * explanatory text around the JSON, double-encoded JSON strings, and single-key
 * wrapper objects (e.g. { trade: {...} }).
 */
export function extractTradeJson(raw: string | null | undefined): ParseResult {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "OpenRouter returned empty content (null)" };
  }
  if (typeof raw !== "string") {
    return { ok: false, reason: `OpenRouter returned non-string content (${typeof raw})` };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, reason: "OpenRouter returned empty content" };
  }

  // Candidate raw strings to try parsing, most likely first.
  const candidates: string[] = [trimmed];

  // Strip markdown code fences (```json ... ``` or ``` ... ```) and bare "json" tags.
  const deFenced = trimmed
    .replace(/```(?:json|javascript)?\s*/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*json\s*[\r\n]*/i, "")
    .trim();
  if (deFenced !== trimmed) {
    candidates.push(deFenced);
  }

  // Fall back to pulling the first balanced {...} block out of surrounding prose.
  const block = extractBalancedJson(trimmed);
  if (block && block !== trimmed) {
    candidates.push(block);
  }

  for (const candidate of candidates) {
    let parsed: any = null;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      // try next candidate
    }

    // If JSON.parse produced a string (double-encoded JSON), parse it again.
    if (typeof parsed === "string" && parsed.trim() !== "") {
      try {
        parsed = JSON.parse(parsed.trim());
      } catch {
        // not double-encoded; ignore
      }
    }

    const trade = unwrapTrade(parsed);
    if (trade && typeof trade === "object" && !Array.isArray(trade)) {
      return { ok: true, trade };
    }
  }

  return {
    ok: false,
    reason: `No valid JSON object found in response (type=${typeof raw}, length=${raw.length})`,
  };
}

/** Locate the first balanced { ... } region in a string (tolerates prose around it). */
function extractBalancedJson(input: string): string | null {
  const start = input.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * If the model wrapped the trade in a single-key container like
 * { trade: {...} } or { data: {...} }, unwrap it. Returns the input as-is
 * when there is no wrapper.
 */
function unwrapTrade(parsed: any): any {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  const keys = Object.keys(parsed);
  if (keys.length === 1) {
    const inner = parsed[keys[0]];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      // Only unwrap when the inner value looks like trade data.
      if (typeof inner.ticker !== "undefined" || typeof inner.entry !== "undefined" || typeof inner.size !== "undefined") {
        return inner;
      }
    }
  }
  return parsed;
}

const FILL_PRICE_KEYS = [
  "entry_fill", "entry_fill_price", "entry_average_fill_price", "entry_avg_fill_price",
  "entry_average_price", "entry_avg_price", "entry_execution_price", "entry_executed_price",
  "exit_fill", "exit_fill_price", "exit_average_fill_price", "exit_avg_fill_price",
  "exit_average_price", "exit_avg_price", "exit_execution_price", "exit_executed_price",
];
const LIMIT_PRICE_KEYS = ["entry_limit", "entry_limit_price", "exit_limit", "exit_limit_price"];

function pickNonEmpty(obj: any, keys: string[]): string | null {
  for (const key of keys) {
    const val = obj?.[key];
    if (val !== null && val !== undefined && String(val).trim() !== "") {
      return String(val).trim();
    }
  }
  return null;
}

/**
 * Resolve the actual trade price for one side with the required priority:
 * fill/execution price > model's direct choice > limit price (fallback only).
 */
export function resolveSidePrice(trade: any, side: "entry" | "exit"): string | null {
  // 1. Actual fill/execution price always wins over limit price.
  const fillKeys = FILL_PRICE_KEYS.filter((k) => k.startsWith(side));
  const fill = pickNonEmpty(trade, fillKeys);
  if (fill) {
    return fill;
  }
  // 2. Fall back to the model's direct choice (prompt already prefers fill).
  const direct = pickNonEmpty(trade, [side]);
  if (direct) {
    return direct;
  }
  // 3. Last resort: the order's limit price (only when no fill is visible).
  const limit = pickNonEmpty(trade, LIMIT_PRICE_KEYS.filter((k) => k.startsWith(side)));
  return limit;
}

/** Apply fill-price priority to both entry and exit on a parsed trade object. */
export function resolveTradePrices(trade: Record<string, any>): void {
  trade.entry = resolveSidePrice(trade, "entry");
  trade.exit = resolveSidePrice(trade, "exit");
}