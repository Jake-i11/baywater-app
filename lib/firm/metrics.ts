/**
 * Shared trade metrics for firm coach views.
 * Formulas match student Analytics / Dashboard / Profile pages:
 * - win rate = winningTrades.length / trades.length * 100
 * - profit factor = grossWins / grossLosses (uncapped when no losses)
 * - win/loss classified by realized_pl > 0 / < 0
 * - average discipline = mean of (discipline_score || 0) like Profile
 */

export type TradeLike = {
  realized_pl?: string | number | null;
  discipline_score?: number | null;
  violations?: string | string[] | null;
  size?: string | number | null;
  setup_type?: string | null;
  entry_time?: string | null;
  created_at?: string | null;
  ticker?: string | null;
  ai_review?: string | null;
  id?: string;
};

export function getTradePL(trade: TradeLike): number | null {
  if (trade.realized_pl === null || trade.realized_pl === undefined) return null;
  const n = typeof trade.realized_pl === "number" ? trade.realized_pl : parseFloat(trade.realized_pl);
  return Number.isFinite(n) ? n : null;
}

export function getViolations(trade: TradeLike): string[] {
  if (!trade.violations) return [];
  if (Array.isArray(trade.violations)) return trade.violations.map(String);
  try {
    const parsed = JSON.parse(trade.violations);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export type AggregateMetrics = {
  trade_count: number;
  total_pl: number;
  win_rate: number | null;
  profit_factor: number | null;
  profit_factor_uncapped: boolean;
  average_discipline_score: number | null;
  winning_trades: number;
  losing_trades: number;
};

/** Overview/roster aggregate — empty set returns zeros (not null) for counts/PL. */
export function aggregateTradeMetrics(trades: TradeLike[]): AggregateMetrics {
  if (trades.length === 0) {
    return {
      trade_count: 0,
      total_pl: 0,
      win_rate: null,
      profit_factor: null,
      profit_factor_uncapped: false,
      average_discipline_score: null,
      winning_trades: 0,
      losing_trades: 0,
    };
  }

  const winningTrades = trades.filter((t) => {
    const pl = getTradePL(t);
    return pl !== null && pl > 0;
  });
  const losingTrades = trades.filter((t) => {
    const pl = getTradePL(t);
    return pl !== null && pl < 0;
  });

  const total_pl = trades.reduce((sum, t) => sum + (getTradePL(t) || 0), 0);
  const win_rate = (winningTrades.length / trades.length) * 100;

  const grossWins = winningTrades.reduce((sum, t) => sum + Math.abs(getTradePL(t) || 0), 0);
  const grossLosses = losingTrades.reduce((sum, t) => sum + Math.abs(getTradePL(t) || 0), 0);

  let profit_factor: number | null;
  let profit_factor_uncapped = false;
  if (grossLosses > 0) {
    profit_factor = grossWins / grossLosses;
  } else if (grossWins > 0) {
    profit_factor = null;
    profit_factor_uncapped = true;
  } else {
    profit_factor = null;
  }

  const average_discipline_score =
    trades.reduce((sum, t) => sum + (t.discipline_score || 0), 0) / trades.length;

  return {
    trade_count: trades.length,
    total_pl,
    win_rate,
    profit_factor,
    profit_factor_uncapped,
    average_discipline_score,
    winning_trades: winningTrades.length,
    losing_trades: losingTrades.length,
  };
}

export type DimensionBucket = {
  key: string;
  label: string;
  trade_count: number;
  total_pl: number;
  win_rate: number | null;
};

function bucketMetrics(trades: TradeLike[], key: string, label: string): DimensionBucket {
  const m = aggregateTradeMetrics(trades);
  return {
    key,
    label,
    trade_count: m.trade_count,
    total_pl: m.total_pl,
    win_rate: m.win_rate,
  };
}

/** Setup type breakdown — same dimension as student Edge/pattern-analysis (setup_type). */
export function breakdownBySetupType(trades: TradeLike[]): DimensionBucket[] {
  const groups: Record<string, TradeLike[]> = {};
  for (const t of trades) {
    const key = (t.setup_type && String(t.setup_type).trim()) || "Unknown";
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return Object.entries(groups)
    .map(([key, list]) => bucketMetrics(list, key, key))
    .sort((a, b) => b.total_pl - a.total_pl);
}

/** Time-of-day hour buckets 9–20 matching Analytics page. */
export function breakdownByEntryHour(trades: TradeLike[]): DimensionBucket[] {
  const hours = Array.from({ length: 12 }, (_, i) => i + 9);
  return hours.map((hour) => {
    const list = trades.filter((t) => {
      const raw = t.entry_time || t.created_at;
      if (!raw) return false;
      return new Date(raw).getHours() === hour;
    });
    return bucketMetrics(list, String(hour), `${hour}:00`);
  });
}

/** Position sizing vs 2× average size — Analytics "Proper Sizing" / "Oversized". */
export function breakdownByPositionSizing(trades: TradeLike[]): DimensionBucket[] {
  const sizes = trades
    .map((t) => (typeof t.size === "number" ? t.size : parseFloat(String(t.size ?? ""))))
    .filter((s) => Number.isFinite(s) && s > 0);
  const avgSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;

  const proper: TradeLike[] = [];
  const oversized: TradeLike[] = [];
  const unknown: TradeLike[] = [];

  for (const t of trades) {
    const s = typeof t.size === "number" ? t.size : parseFloat(String(t.size ?? ""));
    if (!Number.isFinite(s) || s <= 0 || avgSize <= 0) {
      unknown.push(t);
    } else if (s > avgSize * 2) {
      oversized.push(t);
    } else {
      proper.push(t);
    }
  }

  return [
    bucketMetrics(proper, "proper", "Proper Sizing"),
    bucketMetrics(oversized, "oversized", "Oversized Position"),
    bucketMetrics(unknown, "unknown", "Unknown Size"),
  ].filter((b) => b.trade_count > 0);
}

/** Violation category counts — Analytics commonViolations regex buckets. */
export function breakdownByViolationType(trades: TradeLike[]): Array<{
  key: string;
  label: string;
  count: number;
}> {
  const cats = [
    { key: "position_sizing", label: "Position Sizing", re: /size|sizing|position/i },
    { key: "entry_timing", label: "Entry Timing", re: /timing|entry|early|late|chase/i },
    { key: "rule_violation", label: "Rule Violation", re: /./ },
  ];

  return cats
    .map((c) => ({
      key: c.key,
      label: c.label,
      count: trades.filter((t) => getViolations(t).some((v) => c.re.test(v))).length,
    }))
    .filter((c) => c.count > 0);
}

/** Strip AI review to text fields only — no image/screenshot payloads. */
export function sanitizeAiReviewSummary(raw: string | null | undefined): {
  summary: string | null;
  trade_grade: string | null;
  strengths: string[];
  mistakes: string[];
  lesson: string | null;
} | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : null,
      trade_grade: typeof parsed.trade_grade === "string" ? parsed.trade_grade : null,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes.map(String) : [],
      lesson: typeof parsed.lesson === "string" ? parsed.lesson : null,
    };
  } catch {
    return null;
  }
}
