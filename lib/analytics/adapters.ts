/**
 * Analytics adapters — convert raw trade rows from different sources
 * into AnalyticsTradeInput for the shared calculator.
 *
 * Two adapters:
 * 1. Student adapter — converts the student's own trade rows from Supabase.
 * 2. Coach adapter — converts FirmCoachStudentTrade or raw trade rows from the coach path.
 *
 * Both adapters MUST produce identical AnalyticsTradeInput for the same underlying
 * trade so that student and coach analytics always agree.
 */

import {
  AnalyticsTradeInput,
  STOCK_PRICE_BUCKETS,
  FLOAT_BUCKETS,
  SHARE_SIZE_BUCKETS,
  POSITION_SIZE_BUCKETS,
  RELATIVE_VOLUME_BUCKETS,
  DAY_VOLUME_BUCKETS,
  MARKET_CAP_BUCKETS,
} from './types';
import { getTimeBucket, bucketValue } from './calculator';

// ─── Shared bucket helpers ─────────────────────────────────────────────────

function computePositionSize(entryPrice: number | null, size: number | null): number | null {
  if (entryPrice == null || size == null) return null;
  if (!Number.isFinite(entryPrice) || !Number.isFinite(size)) return null;
  return entryPrice * size;
}

// ─── Student adapter ───────────────────────────────────────────────────────

/**
 * Convert a raw trade row from the student's Supabase query into AnalyticsTradeInput.
 *
 * The raw row shape matches what app/analytics/page.tsx and app/dashboard/page.tsx
 * currently fetch: id, ticker, realized_pl (string), entry_price (string), exit_price (string),
 * size (string), side, entry_time, exit_time, discipline_score, violations (JSON string or array),
 * behaviorTags, created_at.
 */
export interface StudentRawTrade {
  id: string;
  user_id: string;
  ticker: string | null;
  realized_pl: string | null;
  entry_price: string | null;
  exit_price: string | null;
  size: string | null;
  side: string | null;
  entry_time: string | null;
  exit_time: string | null;
  discipline_score: number | null;
  violations: string | string[] | null;
  behaviorTags?: string[] | string | null;
  created_at: string;
  /** Optional market enrichment fields */
  float_shares?: number | null;
  market_cap?: number | null;
  relative_volume?: number | null;
  day_volume?: number | null;
}

function parsePL(value: string | null | undefined): number | null {
  if (value == null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function parsePrice(value: string | null | undefined): number | null {
  if (value == null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function parseSize(value: string | null | undefined): number | null {
  if (value == null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseHoldTimeMinutes(entryTime: string | null | undefined, exitTime: string | null | undefined): number | null {
  if (!entryTime) return null;
  const entryMs = new Date(entryTime).getTime();
  if (isNaN(entryMs)) return null;
  if (exitTime) {
    const exitMs = new Date(exitTime).getTime();
    if (!isNaN(exitMs) && exitMs > entryMs) {
      return Math.round((exitMs - entryMs) / 60000);
    }
  }
  // No valid exit time — return null (open trade or unparseable)
  return null;
}

function parseViolations(v: string | string[] | null | undefined): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Adapt a student raw trade row into AnalyticsTradeInput.
 */
export function adaptStudentTrade(raw: StudentRawTrade): AnalyticsTradeInput {
  const entryPrice = parsePrice(raw.entry_price);
  const exitPrice = parsePrice(raw.exit_price);
  const size = parseSize(raw.size);
  const realizedPl = parsePL(raw.realized_pl);
  const holdTimeMinutes = parseHoldTimeMinutes(raw.entry_time, raw.exit_time);
  const violations = parseViolations(raw.violations);
  const side = (raw.side || '').toUpperCase() || 'LONG';
  const behaviorTags = Array.isArray(raw.behaviorTags)
    ? raw.behaviorTags
    : typeof raw.behaviorTags === 'string' && raw.behaviorTags.trim()
      ? (() => { try { const p = JSON.parse(raw.behaviorTags); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } })()
      : [];

  return {
    id: raw.id,
    ticker: (raw.ticker || '').toUpperCase(),
    realizedPl,
    entryPrice,
    exitPrice,
    size,
    side,
    entryTime: raw.entry_time,
    exitTime: raw.exit_time,
    holdTimeMinutes,
    disciplineScore: raw.discipline_score,
    setupType: null, // student path may not have setup_type; leave null → 'Unknown' in calculator
    violations,
    behaviorTags,
    marketCap: raw.market_cap ?? null,
    dayVolume: raw.day_volume ?? null,
    // Pre-compute buckets
    stockPriceBucket: bucketValue(entryPrice, STOCK_PRICE_BUCKETS),
    floatBucket: bucketValue(raw.float_shares ?? null, FLOAT_BUCKETS),
    relativeVolumeBucket: bucketValue(raw.relative_volume ?? null, RELATIVE_VOLUME_BUCKETS),
    dayVolumeBucket: bucketValue(raw.day_volume ?? null, DAY_VOLUME_BUCKETS),
    marketCapBucket: bucketValue(raw.market_cap ?? null, MARKET_CAP_BUCKETS),
    shareSizeBucket: bucketValue(size, SHARE_SIZE_BUCKETS),
    positionSizeBucket: bucketValue(computePositionSize(entryPrice, size), POSITION_SIZE_BUCKETS),
    holdTimeBucket: bucketValue(holdTimeMinutes, {
      '<1 min': [0, 1],
      '1–5 min': [1, 5],
      '5–15 min': [5, 15],
      '15–30 min': [15, 30],
      '30–60 min': [30, 60],
      '1–2 hours': [60, 120],
      '2–4 hours': [120, 240],
      'Over 4 hours': [240, Infinity],
    }),
    timeBucket: getTimeBucket(raw.entry_time),
    followedRules: violations.length === 0,
  };
}

// ─── Coach adapter ─────────────────────────────────────────────────────────

/**
 * Convert a FirmCoachStudentTrade (from lib/firm/types) into AnalyticsTradeInput.
 */
export interface CoachRawTrade {
  id: string;
  ticker: string | null;
  side: string | null;
  size: string | null;
  realized_pl: number | null;
  discipline_score: number | null;
  setup_type: string | null;
  entry_time: string | null;
  exit_time: string | null;
  created_at: string;
  violations: string[];
  ai_review: {
    summary: string | null;
    trade_grade: string | null;
    strengths: string[];
    mistakes: string[];
    lesson: string | null;
  } | null;
  /** Optional market enrichment fields (when available from the trades table) */
  float_shares?: number | null;
  market_cap?: number | null;
  relative_volume?: number | null;
  day_volume?: number | null;
  entry_price?: number | null;
  exit_price?: number | null;
}

/**
 * Adapt a coach raw trade row into AnalyticsTradeInput.
 *
 * Coach queries do NOT select behaviorTags because the trades table has no such
 * column (verified against lib/analyze/supabaseTradeInsert.ts and all migrations).
 * behaviorTags therefore defaults to [] — the same effective value the student
 * sees — so the execution score's setup-quality component contributes 0 in both
 * paths (exact parity, structurally limited until a tags pipeline exists).
 */
export function adaptCoachTrade(raw: CoachRawTrade): AnalyticsTradeInput {
  const entryPrice = raw.entry_price != null ? raw.entry_price : null;
  const exitPrice = raw.exit_price != null ? raw.exit_price : null;
  const size = raw.size != null ? parseFloat(String(raw.size)) : null;
  const realizedPl = raw.realized_pl;
  const holdTimeMinutes = parseHoldTimeMinutes(raw.entry_time, raw.exit_time);
  const side = (raw.side || '').toUpperCase() || 'LONG';
  const behaviorTags = Array.isArray((raw as { behaviorTags?: unknown }).behaviorTags)
    ? (raw as unknown as { behaviorTags: string[] }).behaviorTags
    : [];

  return {
    id: raw.id,
    ticker: (raw.ticker || '').toUpperCase(),
    realizedPl,
    entryPrice,
    exitPrice,
    size: size != null && Number.isFinite(size) && size > 0 ? size : null,
    side,
    entryTime: raw.entry_time,
    exitTime: raw.exit_time,
    holdTimeMinutes,
    disciplineScore: raw.discipline_score,
    setupType: raw.setup_type,
    violations: raw.violations || [],
    behaviorTags,
    marketCap: raw.market_cap ?? null,
    dayVolume: raw.day_volume ?? null,
    stockPriceBucket: bucketValue(entryPrice, STOCK_PRICE_BUCKETS),
    floatBucket: bucketValue(raw.float_shares ?? null, FLOAT_BUCKETS),
    relativeVolumeBucket: bucketValue(raw.relative_volume ?? null, RELATIVE_VOLUME_BUCKETS),
    dayVolumeBucket: bucketValue(raw.day_volume ?? null, DAY_VOLUME_BUCKETS),
    marketCapBucket: bucketValue(raw.market_cap ?? null, MARKET_CAP_BUCKETS),
    shareSizeBucket: bucketValue(size, SHARE_SIZE_BUCKETS),
    positionSizeBucket: bucketValue(computePositionSize(entryPrice, size), POSITION_SIZE_BUCKETS),
    holdTimeBucket: bucketValue(holdTimeMinutes, {
      '<1 min': [0, 1],
      '1–5 min': [1, 5],
      '5–15 min': [5, 15],
      '15–30 min': [15, 30],
      '30–60 min': [30, 60],
      '1–2 hours': [60, 120],
      '2–4 hours': [120, 240],
      'Over 4 hours': [240, Infinity],
    }),
    timeBucket: getTimeBucket(raw.entry_time),
    followedRules: (raw.violations || []).length === 0,
  };
}

// ─── Batch adaptation ──────────────────────────────────────────────────────

/** Adapt an array of student raw trades. */
export function adaptStudentTrades(trades: StudentRawTrade[]): AnalyticsTradeInput[] {
  return trades.map(adaptStudentTrade);
}

/** Adapt an array of coach raw trades. */
export function adaptCoachTrades(trades: CoachRawTrade[]): AnalyticsTradeInput[] {
  return trades.map(adaptCoachTrade);
}
