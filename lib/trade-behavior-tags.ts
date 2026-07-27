/**
 * Trade Behavior Tagging
 *
 * Deterministic per-trade behavior detection that runs instantly on upload.
 * No API calls, no AI, no external data.
 *
 * Tags each completed trade with entry/exit/risk/rule behaviors based on
 * available trade data and chart-derived metrics.
 */

import { parseHoldTimeToMinutes } from "./trade-analytics";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface TradeBehaviorInput {
  ticker: string;
  side: string;
  entry_price: string | null;
  exit_price: string | null;
  size: string;
  entry_time: string | null;
  exit_time: string | null;
  holdTime: string;
  realized_pl: string | null;
  violations: string[];
  discipline_score: number | null;
  tradeMetrics?: {
    mfe?: number | null;
    mae?: number | null;
    bestExitPrice?: number | null;
    missedAmount?: number | null;
    entryContext?: string;
  } | null;
}

export interface TradeBehaviors {
  /** Detected behavior tag labels */
  tags: string[];
  /** Categories these tags belong to */
  categories: string[];
  /** Overall severity of behavior flags for this trade */
  severity: 'low' | 'medium' | 'high';
  /** Short human-readable summary */
  summary: string;
}

// ─── Shared context (computed once per batch) ───────────────────────────────

export interface TaggingContext {
  /** Average position size across all trades in the batch */
  averageTradeSize: number;
}

// ─── Tag constants ──────────────────────────────────────────────────────────

const ENTRY_TAGS = {
  GOOD_TIMING: 'Good Timing',
  CHASED_ENTRY: 'Chased Entry',
  LATE_ENTRY: 'Late Entry',
} as const;

const EXIT_TAGS = {
  EXITED_TOO_EARLY: 'Exited Too Early',
  HELD_LOSER_TOO_LONG: 'Held Loser Too Long',
  GOOD_EXIT: 'Good Exit',
} as const;

const RISK_TAGS = {
  OVERSIZED_POSITION: 'Oversized Position',
  REPEATED_TICKER: 'Repeated Ticker',
} as const;

const RULE_TAGS = {
  DANGEROUS_WIN: 'Dangerous Win',
} as const;

// ─── Detection helpers ──────────────────────────────────────────────────────

/**
 * Detect entry behaviors based on chart metrics and timing.
 */
function detectEntryBehaviors(
  trade: TradeBehaviorInput,
  _ctx: TaggingContext
): string[] {
  const tags: string[] = [];
  const metrics = trade.tradeMetrics;

  // Chased Entry: entry after a large move already happened
  if (metrics?.entryContext) {
    const ctx = metrics.entryContext.toLowerCase();
    // Detect if entry happened after a significant price move
    if (
      ctx.includes('already up') ||
      ctx.includes('already down')
    ) {
      // Extract the percentage move
      const pctMatch = ctx.match(/(\d+\.?\d*)%/);
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        if (pct >= 2.0) {
          tags.push(ENTRY_TAGS.CHASED_ENTRY);
        }
      }
    }
  }

  // Late Entry: entry occurs far after market open
  if (trade.entry_time) {
    const hour = extractSimpleHour(trade.entry_time);
    if (hour >= 10.5) {
      // After 10:30 AM — beyond the opening range window
      tags.push(ENTRY_TAGS.LATE_ENTRY);
    }
  }

  // Good Timing: default positive when no negative entry tags
  if (tags.length === 0 && metrics?.entryContext) {
    const ctx = metrics.entryContext.toLowerCase();
    if (ctx.includes('flat') || ctx.includes('trending')) {
      tags.push(ENTRY_TAGS.GOOD_TIMING);
    }
  }

  return tags;
}

/**
 * Detect exit behaviors based on chart metrics and hold time.
 */
function detectExitBehaviors(
  trade: TradeBehaviorInput,
  _ctx: TaggingContext
): string[] {
  const tags: string[] = [];
  const metrics = trade.tradeMetrics;

  // Exited Too Early: MFE significantly larger than actual profit
  if (
    metrics?.mfe !== null && metrics?.mfe !== undefined &&
    metrics?.missedAmount !== null && metrics?.missedAmount !== undefined
  ) {
    const mfe = Math.abs(metrics.mfe);
    const missed = Math.abs(metrics.missedAmount);
    if (mfe > 0 && missed > 0 && (missed / mfe) > 0.4) {
      // Missed more than 40% of the available move
      tags.push(EXIT_TAGS.EXITED_TOO_EARLY);
    }
  }

  // Held Loser Too Long: large MAE and long duration on a losing trade
  const pl = trade.realized_pl !== null && trade.realized_pl !== 'null'
    ? parseFloat(trade.realized_pl)
    : null;

  if (
    pl !== null && pl < 0 &&
    metrics?.mae !== null && metrics?.mae !== undefined
  ) {
    const mae = Math.abs(metrics.mae);
    const holdMins = parseHoldTimeToMinutes(trade.holdTime || '');
    if (mae > 0 && holdMins > 15) {
      // Significant adverse move and held for a while
      tags.push(EXIT_TAGS.HELD_LOSER_TOO_LONG);
    }
  }

  // Good Exit: if none of the negative exit tags and we have metrics
  if (
    tags.length === 0 &&
    metrics?.bestExitPrice !== null && metrics?.bestExitPrice !== undefined &&
    trade.exit_price
  ) {
    const exit = parseFloat(trade.exit_price);
    const best = metrics.bestExitPrice;
    if (!isNaN(exit) && best !== null) {
      const diff = Math.abs(exit - best);
      const entry = trade.entry_price ? parseFloat(trade.entry_price) : null;
      if (entry !== null && !isNaN(entry)) {
        const moveRange = Math.abs(best - entry);
        if (moveRange > 0 && diff / moveRange < 0.15) {
          // Exit within 15% of best possible exit
          tags.push(EXIT_TAGS.GOOD_EXIT);
        }
      }
    }
  }

  return tags;
}

/**
 * Detect risk behaviors based on position sizing and ticker repetition.
 */
function detectRiskBehaviors(
  trade: TradeBehaviorInput,
  ctx: TaggingContext
): string[] {
  const tags: string[] = [];

  // Oversized Position: size significantly above average
  if (ctx.averageTradeSize > 0) {
    const size = parseFloat(trade.size);
    if (!isNaN(size) && size > 0) {
      const ratio = size / ctx.averageTradeSize;
      if (ratio >= 2) {
        tags.push(RISK_TAGS.OVERSIZED_POSITION);
      }
    }
  }

  // Repeated Ticker: tag applied at the batch level (handled separately)
  // This is added in the main orchestrator after checking all trades

  return tags;
}

/**
 * Detect rule behaviors from existing violations.
 */
function detectRuleBehaviors(trade: TradeBehaviorInput): string[] {
  const tags: string[] = [];

  if (trade.violations.length > 0) {
    // Check for dangerous win
    if (trade.violations.includes('DANGEROUS_WIN')) {
      tags.push(RULE_TAGS.DANGEROUS_WIN);
    }
    // Add actual violation text as tags (excluding DANGEROUS_WIN which is a meta-flag)
    for (const v of trade.violations) {
      const clean = v.trim();
      if (clean && clean !== 'DANGEROUS_WIN' && !tags.includes(clean)) {
        tags.push(clean);
      }
    }
  }

  return tags;
}

// ─── Hour extraction (lightweight, no dependencies) ─────────────────────────

function extractSimpleHour(timestamp: string | null | undefined): number {
  if (!timestamp) return -1;

  const d = new Date(timestamp);
  if (!isNaN(d.getTime())) {
    return d.getHours() + d.getMinutes() / 60;
  }

  // Try HH:MM format
  const match = timestamp.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
  }

  return -1;
}

// ─── Calculate severity ─────────────────────────────────────────────────────

function calculateSeverity(tags: string[], violations: string[]): 'low' | 'medium' | 'high' {
  const highSev = [
    EXIT_TAGS.HELD_LOSER_TOO_LONG,
    RISK_TAGS.OVERSIZED_POSITION,
    RULE_TAGS.DANGEROUS_WIN,
  ];
  const medSev = [
    ENTRY_TAGS.CHASED_ENTRY,
    EXIT_TAGS.EXITED_TOO_EARLY,
  ];

  const hasHigh = tags.some(t => highSev.includes(t as any));
  const hasMed = tags.some(t => medSev.includes(t as any));
  const hasViolations = violations.length > 0;

  if (hasHigh || (hasViolations && violations.length >= 2)) return 'high';
  if (hasMed || hasViolations) return 'medium';
  return tags.length > 0 ? 'low' : 'low';
}

// ─── Build summary ──────────────────────────────────────────────────────────

function buildSummary(tags: string[], severity: string): string {
  if (tags.length === 0) return 'No behavior flags';
  if (tags.length === 1) return `${tags[0]} (${severity})`;
  return `${tags[0]}, ${tags[1]}${tags.length > 2 ? ` +${tags.length - 2} more` : ''} (${severity})`;
}

// ─── Main tagger ────────────────────────────────────────────────────────────

/**
 * Tag a single trade with all detectable behaviors.
 *
 * Runs instantly — O(1) per trade, no API calls, no AI.
 *
 * @param trade The trade to analyze
 * @param ctx Shared context (average trade size across the batch)
 * @param repeatedTickers Set of tickers that appear 3+ times in the batch
 */
export function tagTrade(
  trade: TradeBehaviorInput,
  ctx: TaggingContext,
  repeatedTickers?: Set<string>
): TradeBehaviors {
  const allTags: string[] = [];

  // Entry behaviors
  allTags.push(...detectEntryBehaviors(trade, ctx));

  // Exit behaviors
  allTags.push(...detectExitBehaviors(trade, ctx));

  // Risk behaviors
  allTags.push(...detectRiskBehaviors(trade, ctx));

  // Rule behaviors
  allTags.push(...detectRuleBehaviors(trade));

  // Repeated ticker (from batch context)
  if (repeatedTickers && repeatedTickers.has(trade.ticker.toUpperCase())) {
    allTags.push(RISK_TAGS.REPEATED_TICKER);
  }

  // Determine categories
  const categories: string[] = [];
  const entryNames = Object.values(ENTRY_TAGS);
  const exitNames = Object.values(EXIT_TAGS);
  const riskNames = Object.values(RISK_TAGS);
  const ruleNames = Object.values(RULE_TAGS);

  if (allTags.some(t => entryNames.includes(t as any))) categories.push('entry');
  if (allTags.some(t => exitNames.includes(t as any))) categories.push('exit');
  if (allTags.some(t => riskNames.includes(t as any))) categories.push('risk');
  if (allTags.some(t => ruleNames.includes(t as any))) categories.push('rule');

  const severity = calculateSeverity(allTags, trade.violations);
  const summary = buildSummary(allTags, severity);

  return { tags: allTags, categories, severity, summary };
}

/**
 * Compute batch-level tagging context from a list of trades.
 * Must be called once per batch before calling tagTrade() on individual trades.
 *
 * Returns:
 * - averageTradeSize: the mean position size across all trades
 * - repeatedTickers: tickers appearing 3+ times (capped at 5)
 */
export function computeTaggingContext(
  trades: { ticker: string; size: string }[]
): { averageTradeSize: number; repeatedTickers: Set<string> } {
  const sizes: number[] = [];
  const tickerCounts: Record<string, number> = {};

  for (const t of trades) {
    const sz = parseFloat(t.size);
    if (!isNaN(sz) && sz > 0) sizes.push(sz);

    const ticker = (t.ticker || '').toUpperCase();
    if (ticker) tickerCounts[ticker] = (tickerCounts[ticker] || 0) + 1;
  }

  const averageTradeSize = sizes.length > 0
    ? sizes.reduce((sum, s) => sum + s, 0) / sizes.length
    : 0;

  const repeatedTickers = new Set(
    Object.entries(tickerCounts)
      .filter(([_, count]) => count >= 3)
      .slice(0, 5)
      .map(([ticker]) => ticker)
  );

  return { averageTradeSize, repeatedTickers };
}

/**
 * Build the behavior summary string for a list of trades.
 * Used in the BehaviorDashboard.
 */
export function buildAggregateSummary(trades: TradeBehaviors[]): string {
  const allTags = trades.flatMap(t => t.tags);
  if (allTags.length === 0) return 'Clean trading — no behavior flags';

  // Count most common tags
  const counts: Record<string, number> = {};
  for (const tag of allTags) {
    counts[tag] = (counts[tag] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3);

  return top.map(([tag, count]) => `${tag} (${count}x)`).join(', ');
}
