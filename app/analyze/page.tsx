"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck, TrendingUp, TrendingDown, BarChart3, Clock, DollarSign, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { TradeChart } from "@/components/TradeChart";
import { fromZonedTime } from "date-fns-tz";
import {
  calculateViolationCost,
  calculateDisciplineScore,
  checkDangerousWin,
  calculateTradeMetricsForTrade
} from "@/lib/trade-utils";
import {
  buildTraderProfile,
  generateInsights,
  type TraderProfile,
  type TraderInsights,
  type AnalyticsTrade
} from "@/lib/trade-analytics";
import {
  buildBehaviorReport,
  buildCoachReadyOutput,
  type BehaviorReport,
  type CoachReadyOutput,
  type BehaviorTrade
} from "@/lib/behavior-analytics";
import {
  type TradeCoachingResponse
} from "@/lib/ai/coach";
import {
  tagTrade,
  computeTaggingContext,
  buildAggregateSummary,
  type TradeBehaviors,
  type TradeBehaviorInput
} from "@/lib/trade-behavior-tags";
import { BehaviorDashboard, type DashboardTrade } from "@/components/BehaviorDashboard";
import {
  calculateTraderProfile,
  detectBehaviorTrends,
  type TraderProfileState,
  type BehaviorTrend,
  type ProfileTrade
} from "@/lib/trader-profile-state";
import { TradingCoach } from "@/components/TradingCoach";

interface ChartDataCache {
  candles: any[];
  fetchedAt: number;
}

interface TradeMetrics {
  mfe: number | null;
  mfeDisplay: string;
  mae: number | null;
  maeDisplay: string;
  bestExitPrice: number | null;
  bestExitDisplay: string;
  missedAmount: number | null;
  missedDisplay: string;
  entryContext: string;
}

interface TradeData {
  localId: string;
  id?: string;
  ticker: string;
  direction: string;
  /** Normalized side: 'LONG' | 'SHORT' */
  side: string;
  entry_price: string | null;
  exit_price: string | null;
  size: string;
  entry_time: string | null;
  exit_time: string | null;
  timestamp: string | null;
  realized_pl: string | null;
  /** Precomputed hold-time string e.g. "12m", "1h 24m", "Open trade" */
  holdTime: string;
  violations: string[];
  violationsCount: number;
  discipline_score: number | null;
  violation_cost: string | null;
  displayTime?: string;
  chartData: ChartDataCache | null;
  tradeMetrics: TradeMetrics | null;
  aiReview: TradeCoachingResponse | null;
  aiReviewGeneratedAt: number | null;
  /** Deterministic behavior tags computed instantly after upload */
  behaviorTags: string[];
  behaviorSeverity: string;
  behaviorSummary: string;
  rawData?: any;
}

function formatNumber(num: number) {
  return num.toLocaleString("en-US");
}

function formatPL(value: string | null | undefined): string {
  if (value === null || value === undefined || value === 'null') return "\u2014";
  const num = parseFloat(value);
  if (isNaN(num)) return "\u2014";
  const sign = num >= 0 ? "+" : "";
  return `${sign}$${num.toFixed(2)}`;
}

let _localIdCounter = 0;
function nextLocalId(): string {
  return `trade_${++_localIdCounter}_${Date.now()}`;
}

/**
 * Compute a human-readable hold time from entry and exit timestamps.
 * Supports:
 *   - ISO 8601 strings ("2026-07-24 14:15:00", "2026-07-24T14:15:00Z")
 *   - Brokerage timestamps (parsable by Date)
 * Returns "Open trade" if exit_time is missing.
 */
function computeHoldTime(
  entryTime: string | null | undefined,
  exitTime: string | null | undefined
): string {
  if (!entryTime || !exitTime) return "Open trade";

  const entryMs = new Date(entryTime).getTime();
  const exitMs = new Date(exitTime).getTime();

  if (isNaN(entryMs) || isNaN(exitMs)) return "Open trade";

  const diffMs = exitMs - entryMs;
  if (diffMs < 0) return "Open trade";

  const totalMinutes = Math.round(diffMs / 60000);

  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Compute a P&L value from a raw trade object when no realized_pl is provided.
 * LONG:  (exit - entry) * size
 * SHORT: (entry - exit) * size
 * Returns the raw numeric value or null if insufficient data.
 */
function computePLValue(trade: {
  entry_price: string | null | undefined;
  exit_price: string | null | undefined;
  size: string | null | undefined;
  direction?: string;
}): number | null {
  const entry = trade.entry_price ? parseFloat(trade.entry_price) : null;
  const exit = trade.exit_price ? parseFloat(trade.exit_price) : null;
  const size = trade.size ? parseFloat(trade.size) : null;

  if (entry === null || exit === null || size === null) return null;

  const isShort = trade.direction?.toLowerCase() === 'short';

  if (isShort) {
    return (entry - exit) * size;
  } else {
    return (exit - entry) * size;
  }
}

/** Normalize a raw direction string to 'LONG' | 'SHORT' */
function normalizeSide(direction: string | undefined | null): string {
  const d = (direction || '').toLowerCase();
  if (d === 'short' || d === 'sell') return 'SHORT';
  return 'LONG';
}

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null);
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [selectedTradeIndex, setSelectedTradeIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [coachingResponse, setCoachingResponse] = useState<TradeCoachingResponse | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'trades' | 'profile' | 'coach' | 'analytics'>('trades');
  const [analysisPhase, setAnalysisPhase] = useState<string | null>(null);

  // Refs to avoid race conditions when trades switch mid-fetch
  const pendingChartTrade = useRef<string | null>(null);
  const pendingReviewTrade = useRef<string | null>(null);

  const [rules, setRules] = useState({
    maxFloat: 10_000_000,
    minPrice: 2,
    maxPrice: 10,
    tradeBefore9AM: true,
    allowedTickers: ["AAPL", "TSLA", "NVDA"],
    maxTradesPerDay: 3,
  });

  // Display state for the formatted max float input
  const [floatDisplay, setFloatDisplay] = useState(formatNumber(rules.maxFloat));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleFloatChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/,/g, "");
      const num = raw === "" ? 0 : Number(raw);
      if (!isNaN(num)) {
        setRules((prev) => ({ ...prev, maxFloat: num }));
        setFloatDisplay(formatNumber(num));
      }
    },
    []
  );

  // ─── When the selected trade changes, load chart + enrichment lazily ───
  useEffect(() => {
    if (selectedTradeIndex === null || selectedTradeIndex >= trades.length) {
      setCandles([]);
      setCoachingResponse(null);
      setChartError(null);
      return;
    }

    const trade = trades[selectedTradeIndex];
    if (!trade) return;

    const tradeId = trade.localId;
    pendingChartTrade.current = tradeId;
    pendingReviewTrade.current = null;

    // ── Check chart cache first ──
    if (trade.chartData) {
      console.log('[Chart Cache] ticker:', trade.ticker, 'cached: true');
      setCandles(trade.chartData.candles);
      setChartLoading(false);
      setChartError(null);

      // Calculate metrics from cached data if not already done
      if (!trade.tradeMetrics) {
        const metrics = calculateTradeMetricsForTrade(trade, trade.chartData.candles);
        setTrades(prev => prev.map(t =>
          t.localId === tradeId ? { ...t, tradeMetrics: metrics } : t
        ));
      }
    } else {
      setChartLoading(false);
      setCandles([]);
      setChartError(null);

      console.log('[Chart Cache] ticker:', trade.ticker, 'cached: false, fetching...');
    }

    setCoachingResponse(null);

    // Determine chart timestamps from the trade data
    const chartEntryTime = trade.timestamp || trade.entry_time;
    const chartExitTime = trade.exit_time || null;

    // Compute tradeDate once here so enrichment doesn't close over stale state
    let tradeDate: string | null = null;
    if (trade.entry_time) {
      try {
        const utcDate = fromZonedTime(trade.entry_time, 'America/New_York');
        tradeDate = utcDate.toISOString().split('T')[0];
      } catch {
        // fallback below
      }
    }
    if (!tradeDate) {
      tradeDate = new Date().toISOString().split('T')[0];
    }

    // Fetch chart data only if not cached
    if (!trade.chartData) {
      if (trade.ticker && chartEntryTime) {
        fetchChartData(trade.ticker, chartEntryTime, chartExitTime, tradeId);
      } else {
        console.warn(`Skipping chart fetch for ${trade.ticker} — no timestamp available`);
      }
    }

    // Fetch AI review (from DB if already enriched, or trigger enrichment)
    if (user && trade.id) {
      fetchOrGenerateAIReview(trade.id, trade.ticker, tradeDate);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTradeIndex, trades, user]);

  // ─── Fetch AI coaching review from DB, or trigger generation ───
  async function fetchOrGenerateAIReview(
    tradeId: string,
    ticker: string,
    tradeDate: string
  ) {
    // Record which trade we're fetching review for
    pendingReviewTrade.current = tradeId;
    setAiReviewLoading(true);

    try {
      // Check trade state cache first (fastest)
      const localTrade = trades.find(t => t.id === tradeId);
      if (localTrade?.aiReview && localTrade?.aiReviewGeneratedAt) {
        // Cached in trade state — reuse
        setCoachingResponse(localTrade.aiReview);
        setAiReviewLoading(false);
        return;
      }

      // First, try to fetch the trade from DB
      const { data: dbTrade } = await supabase
        .from('trades')
        .select('ai_review, entry_time')
        .eq('id', tradeId)
        .single();

      // Stale check
      if (pendingReviewTrade.current !== tradeId) return;

      if (dbTrade?.ai_review) {
        // Already enriched — parse it and use it
        try {
          const parsedReview = typeof dbTrade.ai_review === 'string'
            ? JSON.parse(dbTrade.ai_review)
            : dbTrade.ai_review;
          if (parsedReview && parsedReview.grade) {
            setCoachingResponse(parsedReview as TradeCoachingResponse);
            // Update trade cache
            setTrades(prev => prev.map(t =>
              t.id === tradeId
                ? { ...t, aiReview: parsedReview, aiReviewGeneratedAt: Date.now() }
                : t
            ));
            setAiReviewLoading(false);
            return;
          }
        } catch {
          // Parsing failed, continue to generate
        }
      }

      // Build trader context to send with the enrichment request
      const traderContext: any = {};

      // Add behavior tags from the current trade
      const currentTradeForCoach = trades.find(t => t.id === tradeId);
      if (currentTradeForCoach?.behaviorTags && currentTradeForCoach.behaviorTags.length > 0) {
        traderContext.behaviorTags = currentTradeForCoach.behaviorTags;
        traderContext.behaviorSeverity = currentTradeForCoach.behaviorSeverity;
      }

      // Add recent trade history summary (last 5 trades with similar behavior)
      const recentTrades = trades.slice(-10);
      const recentBehaviorCounts: Record<string, number> = {};
      for (const t of recentTrades) {
        if (t.behaviorTags) {
          for (const tag of t.behaviorTags) {
            recentBehaviorCounts[tag] = (recentBehaviorCounts[tag] || 0) + 1;
          }
        }
      }
      const topRecentPatterns = Object.entries(recentBehaviorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag, count]) => `${tag} (${count}/${recentTrades.length})`);
      if (topRecentPatterns.length > 0) {
        traderContext.recentTradeSummary = `Last ${recentTrades.length} trades: ${topRecentPatterns.join(', ')}`;
      }

      if (traderAnalytics) {
        traderContext.traderProfile = {
          totalTrades: traderAnalytics.statistics.totalTrades,
          winRate: traderAnalytics.statistics.winRate,
          totalProfitLoss: traderAnalytics.statistics.totalProfitLoss,
          profitFactor: traderAnalytics.statistics.profitFactor,
          averagePositionSize: traderAnalytics.statistics.averagePositionSize,
          averageHoldTime: traderAnalytics.statistics.averageHoldTime,
          averageWinner: traderAnalytics.statistics.averageWinner,
          averageLoser: traderAnalytics.statistics.averageLoser,
          longWinRate: traderAnalytics.statistics.longWinRate,
          shortWinRate: traderAnalytics.statistics.shortWinRate,
          longTrades: traderAnalytics.statistics.longTrades,
          shortTrades: traderAnalytics.statistics.shortTrades,
          morningWinRate: traderAnalytics.statistics.morningWinRate,
          afternoonWinRate: traderAnalytics.statistics.afternoonWinRate,
          bestTradingWindow: traderAnalytics.statistics.bestTradingWindow,
          worstTradingWindow: traderAnalytics.statistics.worstTradingWindow,
          averageDisciplineScore: traderAnalytics.statistics.averageDisciplineScore,
          mostTradedTickers: traderAnalytics.statistics.mostTradedTickers,
        };
      }

      if (behaviorReport) {
        traderContext.behaviorReport = {
          strengths: behaviorReport.strengths.map(s => s.description || s.title),
          weaknesses: behaviorReport.weaknesses.map(w => w.description || w.title),
          tendencies: behaviorReport.patterns
            .filter(p => p.category === 'tendency')
            .map(t => t.description || t.title),
        };
      }

      // Add TraderProfileState data for persistent coaching context
      if (traderProfileState) {
        traderContext.traderProfileState = {
          totalTrades: traderProfileState.totalTrades,
          strengths: traderProfileState.strengths,
          weaknesses: traderProfileState.weaknesses,
          recurringMistakes: traderProfileState.recurringMistakes,
          personalRules: traderProfileState.personalRules,
          improvementScore: traderProfileState.improvementScore,
        };
      }

      // No review yet — trigger enrichment with trader context
      const enrichResponse = await fetch("/api/analyze/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, ticker, tradeDate, traderContext }),
      });

      // Stale check again after async call
      if (pendingReviewTrade.current !== tradeId) return;

      if (enrichResponse.ok) {
        // Re-fetch the trade to get the coaching response
        const { data: updatedTrade } = await supabase
          .from('trades')
          .select('ai_review')
          .eq('id', tradeId)
          .single();

        // Final stale check
        if (pendingReviewTrade.current !== tradeId) return;

        if (updatedTrade?.ai_review) {
          try {
            const parsedReview = typeof updatedTrade.ai_review === 'string'
              ? JSON.parse(updatedTrade.ai_review)
              : updatedTrade.ai_review;
            if (parsedReview && parsedReview.grade) {
              setCoachingResponse(parsedReview as TradeCoachingResponse);
              // Update trade cache in state
              setTrades(prev => prev.map(t =>
                t.id === tradeId
                  ? { ...t, aiReview: parsedReview, aiReviewGeneratedAt: Date.now() }
                  : t
              ));
            } else {
              setCoachingResponse(null);
            }
          } catch {
            setCoachingResponse(null);
          }
        } else {
          setCoachingResponse(null);
        }
      } else {
        const errData = await enrichResponse.json().catch(() => ({}));
        console.error(`Failed to enrich trade ${tradeId}:`, errData.error || enrichResponse.statusText);
        setCoachingResponse(null);
      }
    } catch (error) {
      console.error(`Error fetching/generating AI review for trade ${tradeId}:`, error);
      if (pendingReviewTrade.current === tradeId) {
        setCoachingResponse(null);
      }
    } finally {
      if (pendingReviewTrade.current === tradeId) {
        setAiReviewLoading(false);
      }
    }
  }

  function checkRules(trade: any) {
    const violations: string[] = [];
    if (!trade) return violations;

    if (trade.ticker && !rules.allowedTickers.includes(trade.ticker))
      violations.push("Ticker not allowed");

    if (trade.price !== undefined) {
      const price = Number(trade.price);
      if (price < rules.minPrice) violations.push(`Price below $${rules.minPrice}`);
      if (price > rules.maxPrice) violations.push(`Price above $${rules.maxPrice}`);
    }

    if (rules.tradeBefore9AM && trade.time) {
      const timeStr = trade.time;
      const match = (timeStr || '').match(/(\d{1,2}):?(\d{2})?/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        if (hours > 9 || (hours === 9 && minutes > 0)) {
          violations.push("Trade placed after 9:00 AM");
        }
      }
    }

    return violations;
  }

  function parseTradeTime(timeStr: string | null | undefined): Date | null {
    if (!timeStr || typeof timeStr !== 'string' || timeStr.trim() === '') {
      console.warn(`parseTradeTime: invalid/missing time value:`, timeStr);
      return null;
    }

    const trimmed = timeStr.trim();

    if (trimmed === 'Invalid Date') {
      console.warn(`parseTradeTime: received 'Invalid Date' string — cannot parse`);
      return null;
    }

    const now = new Date();
    let hours = 0;
    let minutes = 0;
    let isPM = false;

    const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = match[2] ? parseInt(match[2], 10) : 0;
      isPM = (match[3]?.toUpperCase() === 'PM');

      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }

    const tradeDate = new Date(now);
    tradeDate.setHours(hours, minutes, 0, 0);

    return tradeDate;
  }

  function parseBrokerageTimestamp(timestamp: string): Date {
    const cleanTimestamp = timestamp.replace(/\s*(ET|CT|MT|PT)$/i, '').trim();

    const match = cleanTimestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})([ap])/i);
    if (!match) {
      console.warn(`Could not parse timestamp: ${timestamp}`);
      return new Date();
    }

    const [, month, day, year, hour, minute, period] = match;
    const fullYear = 2000 + parseInt(year, 10);

    let hours = parseInt(hour, 10);
    if (period.toLowerCase() === 'p' && hours < 12) hours += 12;
    if (period.toLowerCase() === 'a' && hours === 12) hours = 0;

    return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10), hours, parseInt(minute, 10), 0, 0);
  }

  /**
   * Pair executions into completed trades with true position tracking.
   *
   * Brokerage execution CSV format uses individual Short / Cover rows.
   * - Short/Buy executions are *accumulated* into a running position (weighted avg price).
   * - Cover/Sell executions close shares from the open position, never exceeding it.
   * - If cover exceeds open position, excess cover shares are silently ignored.
   * - If open position remains after all rows, an OPEN trade card is created.
   *
   * Trade status values: CLOSED, PARTIAL, OPEN
   */
  function pairExecutionsIntoTrades(executions: any[]): any[] {
    const validExecutions = executions.filter(exec => {
      const hasCancelReason = exec.cancelReason && exec.cancelReason.trim() !== '';
      return !hasCancelReason;
    });

    if (validExecutions.length === 0) return [];

    const byTicker: Record<string, any[]> = {};
    validExecutions.forEach(exec => {
      if (!byTicker[exec.ticker]) byTicker[exec.ticker] = [];
      byTicker[exec.ticker].push(exec);
    });

    const completedTrades: any[] = [];

    for (const [ticker, tickerExecs] of Object.entries(byTicker)) {
      const sortedExecs = [...tickerExecs].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // ── Position state per ticker ──
      let position: {
        direction: 'short' | 'long';
        openQuantity: number;       // shares currently open
        totalCost: number;           // cost basis for weighted average
        firstTimestamp: string;      // when position was first opened
      } | null = null;

      let opensCount = 0;
      let coversCount = 0;

      console.log(`[Position Tracker]`);
      console.log(`Ticker: ${ticker}`);
      console.log(`Starting position: none`);

      for (const exec of sortedExecs) {
        const quantity = parseFloat(exec.size);
        const price = parseFloat(exec.price);
        const direction = exec.direction.toLowerCase();

        console.log(`Execution: ${direction.toUpperCase()} ${quantity.toFixed(0)} @ ${price.toFixed(2)}`);

        if (direction === 'short' || direction === 'buy') {
          // ── Opening execution: accumulate into position ──
          if (!position) {
            position = {
              direction: direction === 'short' ? 'short' : 'long',
              openQuantity: 0,
              totalCost: 0,
              firstTimestamp: exec.timestamp,
            };
          }
          position.openQuantity += quantity;
          position.totalCost += quantity * price;
          opensCount++;
        } else if (direction === 'cover' || direction === 'sell') {
          // ── Closing execution: match against open position ──
          if (!position || position.openQuantity <= 0) {
            console.warn(`[Position Tracker] ${ticker} — cover/sell with no open position, skipping`);
            continue;
          }

          // Cap close quantity at currently open quantity — never inflate trade size
          const closeQuantity = Math.min(quantity, position.openQuantity);
          const avgEntryPrice = position.totalCost / position.openQuantity;

          let realizedPL = 0;
          if (position.direction === 'short') {
            realizedPL = (avgEntryPrice - price) * closeQuantity;
          } else {
            realizedPL = (price - avgEntryPrice) * closeQuantity;
          }

          // Determine trade status
          const positionFullyClosed = closeQuantity >= position.openQuantity;
          const status = positionFullyClosed ? 'CLOSED' : 'PARTIAL';

          const side = position.direction.toUpperCase();

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
          };

          completedTrades.push(completedTrade);
          coversCount++;

          console.log(`Closed quantity: ${closeQuantity.toFixed(0)}`);

          // Reduce position
          if (!positionFullyClosed) {
            position.openQuantity -= closeQuantity;
            position.totalCost -= closeQuantity * avgEntryPrice;
            console.log(`Remaining quantity: ${position.openQuantity.toFixed(0)}`);
          } else {
            position = null;
            console.log(`Remaining quantity: 0`);
          }

          console.log(`Created trade: ${status} ${side} ${closeQuantity.toFixed(0)} shares`);
        }
      }

      // ── If position remains open after all rows, create an OPEN trade ──
      if (position && position.openQuantity > 0) {
        const avgEntryPrice = position.totalCost / position.openQuantity;
        const side = position.direction.toUpperCase();

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
        };

        completedTrades.push(openTrade);

        console.log(`[Position Tracker] ${ticker} — remaining open position: ${side} ${position.openQuantity.toFixed(0)} shares @ $${avgEntryPrice.toFixed(2)}`);
      }
    }

    return completedTrades;
  }

  function normalizeHeaderName(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_ ]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  const HEADER_ALIASES: Record<string, string> = {
    ticker: 'ticker',
    symbol: 'ticker',
    security: 'ticker',
    instrument: 'ticker',
    side: 'side',
    type: 'side',
    action: 'side',
    direction: 'side',
    entry: 'entry_price',
    entry_price: 'entry_price',
    entryprice: 'entry_price',
    avg_price: 'entry_price',
    avgprice: 'entry_price',
    buy_price: 'entry_price',
    buyprice: 'entry_price',
    open: 'entry_price',
    open_price: 'entry_price',
    exit: 'exit_price',
    exit_price: 'exit_price',
    exitprice: 'exit_price',
    close_price: 'exit_price',
    closeprice: 'exit_price',
    sell_price: 'exit_price',
    sellprice: 'exit_price',
    close: 'exit_price',
    time: 'entry_time',
    entry_time: 'entry_time',
    entrytime: 'entry_time',
    timestamp: 'entry_time',
    date: 'date',
    exit_time: 'exit_time',
    exittime: 'exit_time',
    quantity: 'size',
    size: 'size',
    shares: 'size',
    qty: 'size',
    amount: 'size',
    price: 'price',
    pnl: 'realized_pl',
    p_l: 'realized_pl',
    p_and_l: 'realized_pl',
    realized_pl: 'realized_pl',
    profit_loss: 'realized_pl',
    pl: 'realized_pl',
    cancel_reason: 'cancel_reason',
    cancelreason: 'cancel_reason',
    order_date: 'order_date',
    transaction_date: 'transaction_date',
  };

  function buildColumnMapping(headers: string[]): Record<string, number> {
    const mapping: Record<string, number> = {};
    for (let i = 0; i < headers.length; i++) {
      const normalized = normalizeHeaderName(headers[i]);
      const canonical = HEADER_ALIASES[normalized];
      if (canonical && mapping[canonical] === undefined) {
        mapping[canonical] = i;
      }
    }
    return mapping;
  }

  function isExecutionFormat(colMap: Record<string, number>): boolean {
    const hasDirection = colMap['side'] !== undefined;
    const hasPrice = colMap['price'] !== undefined;
    const hasEntryPrice = colMap['entry_price'] !== undefined;
    const hasExitPrice = colMap['exit_price'] !== undefined;

    if (hasDirection && hasPrice && !hasEntryPrice && !hasExitPrice) return true;
    if (!hasEntryPrice && hasPrice) return true;
    return false;
  }

  function parseNumeric(value: string | undefined): number | null {
    if (!value || value.trim() === '') return null;
    const cleaned = value.trim().replace(/[$,]/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
  }

  function parseCSVContent(content: string): any[] {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    if (lines.length <= 1) return [];

    const rawHeaders = parseCSVLine(lines[0]);
    const colMap = buildColumnMapping(rawHeaders);

    console.log('[CSV Debug] Raw headers:', rawHeaders);
    console.log('[CSV Debug] Normalized column mapping:', colMap);

    if (colMap['ticker'] === undefined) {
      console.error('[CSV Debug] Missing ticker/symbol column. Headers found:', rawHeaders);
      return [];
    }

    const hasPriceData = colMap['price'] !== undefined || colMap['entry_price'] !== undefined;
    if (!hasPriceData) {
      console.error('[CSV Debug] Missing price/entry column.');
      return [];
    }

    const execFormat = isExecutionFormat(colMap);
    if (execFormat) {
      return parseExecutionCSVLines(lines, rawHeaders, colMap);
    } else {
      return parseSimpleTradeCSVLines(lines, rawHeaders, colMap);
    }
  }

  function parseExecutionCSVLines(lines: string[], rawHeaders: string[], colMap: Record<string, number>): any[] {
    const orderDateIdx = rawHeaders.findIndex(h => normalizeHeaderName(h) === 'order_date');
    const transactionDateIdx = rawHeaders.findIndex(h => normalizeHeaderName(h) === 'transaction_date');
    const cancelReasonIdx = rawHeaders.findIndex(h => normalizeHeaderName(h) === 'cancel_reason');

    const executions: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < rawHeaders.length) continue;

      const ticker = values[colMap['ticker']]?.trim() || '';
      const direction = colMap['side'] !== undefined ? (values[colMap['side']]?.trim() || '') : '';

      let priceStr = '';
      if (colMap['price'] !== undefined) {
        priceStr = values[colMap['price']]?.trim() || '';
      } else if (colMap['entry_price'] !== undefined) {
        priceStr = values[colMap['entry_price']]?.trim() || '';
      }

      let sizeStr = '';
      if (colMap['size'] !== undefined) {
        sizeStr = values[colMap['size']]?.trim() || '';
      }

      let timestampStr = '';
      if (transactionDateIdx !== -1) {
        timestampStr = values[transactionDateIdx]?.trim() || '';
      } else if (orderDateIdx !== -1) {
        timestampStr = values[orderDateIdx]?.trim() || '';
      } else if (colMap['entry_time'] !== undefined) {
        timestampStr = values[colMap['entry_time']]?.trim() || '';
      }

      const cancelReason = cancelReasonIdx !== -1 ? (values[cancelReasonIdx]?.trim() || '') : '';

      if (!ticker || !sizeStr || !priceStr) continue;

      const cleanSize = sizeStr.replace(/[",]/g, '');
      const cleanPrice = priceStr.replace(/[^\d.]/g, '');

      let tradeTime: Date;
      if (timestampStr) {
        tradeTime = parseBrokerageTimestamp(timestampStr);
      } else {
        tradeTime = new Date();
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
      });
    }

    return pairExecutionsIntoTrades(executions);
  }

  function parseSimpleTradeCSVLines(lines: string[], rawHeaders: string[], colMap: Record<string, number>): any[] {
    const trades: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < rawHeaders.length) continue;

      const ticker = values[colMap['ticker']]?.trim() || '';

      let entryPrice: number | null = null;
      if (colMap['entry_price'] !== undefined) {
        entryPrice = parseNumeric(values[colMap['entry_price']]);
      }

      let exitPrice: number | null = null;
      if (colMap['exit_price'] !== undefined) {
        exitPrice = parseNumeric(values[colMap['exit_price']]);
      }

      let size: number | null = null;
      if (colMap['size'] !== undefined) {
        size = parseNumeric(values[colMap['size']]);
      }

      let entryTime: string | null = null;
      if (colMap['entry_time'] !== undefined) {
        entryTime = values[colMap['entry_time']]?.trim() || null;
      }

      let date: string | null = null;
      if (colMap['date'] !== undefined) {
        date = values[colMap['date']]?.trim() || null;
      }

      let exitTime: string | null = null;
      if (colMap['exit_time'] !== undefined) {
        exitTime = values[colMap['exit_time']]?.trim() || null;
      }

      let realizedPl: number | null = null;
      if (colMap['realized_pl'] !== undefined) {
        realizedPl = parseNumeric(values[colMap['realized_pl']]);
      }

      let direction: string = 'long';
      if (colMap['side'] !== undefined) {
        const rawSide = values[colMap['side']]?.trim().toLowerCase() || '';
        if (rawSide === 'short' || rawSide === 'sell') {
          direction = 'short';
        } else {
          direction = 'long';
        }
      }

      if (!ticker) continue;
      if (entryPrice === null && exitPrice === null && size === null) continue;

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
      };

      const entryTimeHasDate = entryTime ? /\d{4}-\d{2}-\d{2}/.test(entryTime) : false;

      if (entryTime && entryTimeHasDate) {
        trade.timestamp = entryTime;
      } else if (date && entryTime) {
        trade.timestamp = `${date} ${entryTime}`;
      } else if (entryTime) {
        trade.timestamp = entryTime;
      } else if (date) {
        trade.timestamp = date;
      } else {
        trade.timestamp = null;
      }

      trades.push(trade);
    }

    return trades;
  }

  function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        i++;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
        i++;
      } else {
        currentValue += char;
        i++;
      }
    }
    values.push(currentValue.trim());
    return values.map(v => v.replace(/^"|"$/g, ''));
  }

  function normalizeScreenshotTimestamp(rawTime: string | null | undefined): string | null {
    if (!rawTime || typeof rawTime !== 'string' || rawTime.trim() === '') {
      console.warn('normalizeScreenshotTimestamp: no timestamp provided');
      return null;
    }

    const trimmed = rawTime.trim();
    let clean = trimmed.replace(/\s*\(?\b(EDT|EST|ET)\b\)?\s*$/gi, '').trim();

    try {
      const slashDateMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(.+)$/);
      if (slashDateMatch) {
        let month = slashDateMatch[1].padStart(2, '0');
        let day = slashDateMatch[2].padStart(2, '0');
        let year = slashDateMatch[3];
        if (year.length === 2) year = '20' + year;
        const timePart = slashDateMatch[4].trim();
        const normalizedTime = normalizeTimePart(timePart);
        if (normalizedTime) return `${year}-${month}-${day} ${normalizedTime}`;
        return `${year}-${month}-${day} ${timePart}`;
      }

      const isoDateMatch = clean.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      if (isoDateMatch) {
        const timePart = isoDateMatch[2].trim();
        const normalizedTime = normalizeTimePart(timePart);
        if (normalizedTime) return `${isoDateMatch[1]} ${normalizedTime}`;
        return `${isoDateMatch[1]} ${timePart}`;
      }

      console.warn(`normalizeScreenshotTimestamp: unrecognized format, using cleaned value: "${clean}"`);
      return clean;
    } catch (error) {
      console.warn(`normalizeScreenshotTimestamp: error processing "${rawTime}":`, error);
      return clean || null;
    }
  }

  function normalizeTimePart(timeStr: string): string | null {
    if (!timeStr) return null;

    const hmsMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i);
    if (hmsMatch) {
      let hours = parseInt(hmsMatch[1], 10);
      const minutes = hmsMatch[2];
      const seconds = hmsMatch[3] || '00';
      const isPM = (hmsMatch[4]?.toUpperCase() === 'PM');

      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;

      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }
    return null;
  }

  function parseEasternToUTC(dateTimeStr: string): string | null {
    if (!dateTimeStr || typeof dateTimeStr !== 'string' || dateTimeStr.trim() === '') {
      console.warn(`parseEasternToUTC: invalid input:`, dateTimeStr);
      return null;
    }

    const trimmed = dateTimeStr.trim();

    if (trimmed === 'Invalid Date') {
      console.warn(`parseEasternToUTC: received 'Invalid Date' string`);
      return null;
    }

    try {
      const utcDate = fromZonedTime(trimmed, 'America/New_York');
      if (isNaN(utcDate.getTime())) {
        console.warn(`parseEasternToUTC: fromZonedTime returned invalid date for: "${trimmed}"`);
        return null;
      }
      return utcDate.toISOString();
    } catch (error) {
      console.warn(`parseEasternToUTC: error parsing "${trimmed}":`, error);
      return null;
    }
  }

  async function fetchChartData(
    ticker: string,
    entryTimeStr: string | null | undefined,
    exitTimeStr: string | null | undefined,
    requestId?: string
  ) {
    try {
      setChartLoading(true);
      setCandles([]);
      setChartError(null);

      if (!entryTimeStr) {
        console.warn(`fetchChartData: skipping chart fetch for ${ticker} — no entry time provided`);
        return;
      }

      const entryUTC = parseEasternToUTC(entryTimeStr);

      if (!entryUTC) {
        console.warn(`fetchChartData: skipping chart fetch for ${ticker} — could not parse entry time: "${entryTimeStr}"`);
        if (!requestId || pendingChartTrade.current === requestId) {
          setChartError(`Could not parse entry time: "${entryTimeStr}"`);
        }
        return;
      }

      let exitUTC: string | null = null;
      if (exitTimeStr) {
        exitUTC = parseEasternToUTC(exitTimeStr);
      }

      const entryDate = new Date(entryUTC);

      let startTime: Date;
      let endTime: Date;

      if (exitUTC) {
        const exitDate = new Date(exitUTC);
        startTime = new Date(entryDate.getTime() - 30 * 60 * 1000);
        endTime = new Date(exitDate.getTime() + 30 * 60 * 1000);
      } else {
        startTime = new Date(entryDate.getTime() - 60 * 60 * 1000);
        endTime = new Date(entryDate.getTime() + 120 * 60 * 1000);
      }

      const response = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      // Stale check: if the user switched trades, discard this response
      if (requestId && pendingChartTrade.current !== requestId) return;

      if (response.ok) {
        const chartData = await response.json();
        const candlesCount = chartData.candles?.length || 0;
        // Check stale again after parsing response body
        if (requestId && pendingChartTrade.current !== requestId) return;
        if (candlesCount > 0) {
          // Save chart data to cache AND calculate metrics in a single state update
          setTrades(prev => prev.map(t =>
            t.localId === requestId
              ? {
                  ...t,
                  chartData: { candles: chartData.candles, fetchedAt: Date.now() },
                  tradeMetrics: calculateTradeMetricsForTrade(t, chartData.candles)
                }
              : t
          ));
          // Set candles for chart rendering
          setCandles(chartData.candles);
        } else {
          console.warn(`Chart API returned 0 candles for ${ticker} (provider: ${chartData.provider || 'unknown'})`);
          setChartError(`No chart data returned for ${ticker}`);
        }
      } else {
        let errorMsg = response.statusText;
        try {
          const errBody = await response.json();
          if (errBody.error) errorMsg = errBody.error;
        } catch {}
        console.error("Failed to fetch chart data:", errorMsg);
        if (!requestId || pendingChartTrade.current === requestId) {
          setChartError(`Chart fetch failed: ${errorMsg}`);
        }
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
      if (!requestId || pendingChartTrade.current === requestId) {
        setChartError(`Error fetching chart data: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      if (!requestId || pendingChartTrade.current === requestId) {
        setChartLoading(false);
      }
    }
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setTrades([]);
    setSelectedTradeIndex(null);
    setCandles([]);
    setCoachingResponse(null);
    setChartLoading(false);

    try {
      // ── CSV path ──
      if (file.name.endsWith('.csv')) {
        setAnalysisPhase("Parsing trades...");
        await new Promise(r => setTimeout(r, 50)); // let React paint

        const content = await file.text();
        const parsedTrades = parseCSVContent(content);

        if (parsedTrades.length === 0) {
          const firstLine = content.split('\n')[0];
          let missingHint = '';
          if (firstLine) {
            const lowerHeader = firstLine.toLowerCase();
            if (!lowerHeader.includes('symbol') && !lowerHeader.includes('ticker')) {
              missingHint = ' Make sure the CSV has a "Symbol" or "Ticker" column.';
            } else if (!lowerHeader.includes('price') && !lowerHeader.includes('entry')) {
              missingHint = ' Make sure the CSV has a "Price" or "Entry" column.';
            } else if (!lowerHeader.includes('size') && !lowerHeader.includes('qty') && !lowerHeader.includes('shares') && !lowerHeader.includes('amount') && !lowerHeader.includes('quantity')) {
              missingHint = ' Make sure the CSV has a "Size", "Quantity", or "Shares" column.';
            }
          }
          alert(`No valid trades found in CSV file.${missingHint}`);
          setLoading(false);
          return;
        }

        // Insert to Supabase (if logged in) — NO enrichment during upload
        let insertedDbTrades: any[] = [];
        if (user) {
          const tradeInserts = parsedTrades.map(trade => {
            const entryPrice = trade.entry_price || trade.price || null;
            const exitPrice = trade.exit_price || null;
            const entryTime = trade.entry_time || trade.timestamp || null;
            const exitTime = trade.exit_time || null;
            const direction = trade.direction ? trade.direction.toLowerCase() : 'long';

            let tradeViolations = checkRules({
              ticker: trade.ticker,
              price: entryPrice ? parseFloat(entryPrice) : undefined,
              time: entryTime
            });

            const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null;
            tradeViolations = checkDangerousWin(tradeViolations, realizedPl);
            const violationCost = calculateViolationCost(tradeViolations, realizedPl);
            const disciplineScore = calculateDisciplineScore(tradeViolations);

            return {
              ticker: trade.ticker,
              direction,
              entry: entryPrice,
              exit: exitPrice,
              size: trade.size,
              entry_time: entryTime,
              exit_time: exitTime,
              time: entryTime,
              violations: JSON.stringify(tradeViolations),
              realized_pl: realizedPl?.toFixed(2) || null,
              violation_cost: violationCost.toFixed(2),
              discipline_score: disciplineScore,
              user_id: user.id,
              float_shares: null,
              market_cap: null,
              sector: null,
              day_volume: null,
              avg_volume: null,
              relative_volume: null,
              ai_review: null,
              ai_replay: null,
              setup_quality: null
            };
          });

          const { data: insertedTrades, error } = await supabase
            .from('trades')
            .insert(tradeInserts)
            .select();

          if (error) {
            console.error("Error saving CSV trades:", error);
          } else if (insertedTrades) {
            insertedDbTrades = insertedTrades;
          }
        }

        // Build TradeData[] with local violations/display info
        const tradeList: TradeData[] = parsedTrades.map((trade: any, idx: number) => {
          const entryPrice = trade.entry_price || trade.price || null;
          const exitPrice = trade.exit_price || null;
          const entryTime = trade.entry_time || trade.timestamp || null;
          const exitTime = trade.exit_time || null;
          const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null;

          let tradeViolations = checkRules({
            ticker: trade.ticker,
            price: entryPrice ? parseFloat(entryPrice) : undefined,
            time: entryTime
          });
          tradeViolations = checkDangerousWin(tradeViolations, realizedPl);
          const violationCost = calculateViolationCost(tradeViolations, realizedPl);
          const disciplineScore = calculateDisciplineScore(tradeViolations);

          // Precomputed P&L: use CSV value or calculate from entry/exit/size
          let computedPL: string | null;
          if (realizedPl !== null && !isNaN(realizedPl)) {
            computedPL = realizedPl.toFixed(2);
          } else {
            const fallbackPL = computePLValue({
              entry_price: entryPrice,
              exit_price: exitPrice,
              size: trade.size,
              direction: trade.direction
            });
            computedPL = fallbackPL !== null ? fallbackPL.toFixed(2) : null;
          }

          // Precomputed hold time
          const holdTime = computeHoldTime(entryTime, exitTime);

          // Normalized side
          const side = normalizeSide(trade.direction);

          let displayTime: string;
          if (entryTime) {
            const parsed = parseTradeTime(entryTime);
            if (parsed) {
              displayTime = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            } else {
              const d = new Date(entryTime);
              if (!isNaN(d.getTime())) {
                displayTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              } else {
                displayTime = entryTime;
              }
            }
          } else if (trade.timestamp) {
            const parsed = parseTradeTime(trade.timestamp);
            displayTime = parsed ? parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : trade.timestamp;
          } else {
            displayTime = 'Missing';
          }

          return {
            localId: nextLocalId(),
            id: insertedDbTrades[idx]?.id,
            ticker: trade.ticker,
            direction: trade.direction ? trade.direction.toLowerCase() : 'long',
            side,
            entry_price: entryPrice,
            exit_price: exitPrice,
            size: trade.size,
            entry_time: entryTime,
            exit_time: exitTime,
            timestamp: trade.timestamp || entryTime || null,
            realized_pl: computedPL,
            holdTime,
            violations: tradeViolations,
            violationsCount: tradeViolations.length,
            discipline_score: disciplineScore,
            violation_cost: violationCost.toFixed(2),
            displayTime,
            chartData: null,
            tradeMetrics: null,
            aiReview: null,
            aiReviewGeneratedAt: null,
            behaviorTags: [] as string[],
            behaviorSeverity: 'low',
            behaviorSummary: '',
            rawData: trade
          };
        });

        setAnalysisPhase("Building trader profile...");
        await new Promise(r => setTimeout(r, 50));

        // ── Compute behavior tags instantly ──
        const ctx = computeTaggingContext(parsedTrades);

        setAnalysisPhase("Analyzing behavior patterns...");
        await new Promise(r => setTimeout(r, 50));

        const taggedTrades: TradeData[] = tradeList.map((t: TradeData) => {
          const input: TradeBehaviorInput = {
            ticker: t.ticker,
            side: t.side,
            entry_price: t.entry_price,
            exit_price: t.exit_price,
            size: t.size,
            entry_time: t.entry_time,
            exit_time: t.exit_time,
            holdTime: t.holdTime,
            realized_pl: t.realized_pl,
            violations: t.violations,
            discipline_score: t.discipline_score,
            tradeMetrics: t.tradeMetrics || undefined,
          };
          const behaviors = tagTrade(input, ctx, ctx.repeatedTickers);
          return {
            ...t,
            behaviorTags: behaviors.tags,
            behaviorSeverity: behaviors.severity,
            behaviorSummary: behaviors.summary,
          };
        });

        setAnalysisPhase("Generating coaching insights...");
        await new Promise(r => setTimeout(r, 50));

        setTrades(taggedTrades);
        if (taggedTrades.length > 0) {
          setSelectedTradeIndex(0);
        }
        setAnalysisPhase(null);

      // ── Image path (screenshot) ──
      } else {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/analyze", { method: "POST", body: formData });
        const data = await res.json();

        if (data.error) {
          alert(data.error);
          setLoading(false);
          return;
        }

        const normalizedEntryTime = normalizeScreenshotTimestamp(data.time || null);
        const normalizedExitTime = normalizeScreenshotTimestamp(data.exit_time || null);

        console.log("[Image Trade Extracted]");
        console.log("ticker:", data.ticker);
        console.log("raw entry time:", data.time);
        console.log("normalized entry_time:", normalizedEntryTime);
        console.log("raw exit time:", data.exit_time);
        console.log("normalized exit_time:", normalizedExitTime);

        let violations = checkRules({
          ticker: data.ticker,
          price: parseFloat(data.entry),
          time: normalizedEntryTime
        });

        const realizedPl = data.realized_pl ? parseFloat(data.realized_pl) : null;
        violations = checkDangerousWin(violations, realizedPl);
        const violationCost = calculateViolationCost(violations, realizedPl);
        const disciplineScore = calculateDisciplineScore(violations);

        const resultEntryTime = normalizedEntryTime ? normalizedEntryTime : (data.time || 'Missing');

        // Insert to Supabase (if logged in) — NO enrichment during upload
        let dbId: string | undefined;
        if (user) {
          let tradeDate: string;
          if (normalizedEntryTime) {
            try {
              const utcDate = fromZonedTime(normalizedEntryTime, 'America/New_York');
              tradeDate = utcDate.toISOString().split('T')[0];
            } catch {
              tradeDate = new Date().toISOString().split('T')[0];
            }
          } else {
            tradeDate = new Date().toISOString().split('T')[0];
          }

          const { data: insertedTrade, error } = await supabase
            .from('trades')
            .insert([{
              ticker: data.ticker,
              entry: data.entry,
              exit: data.exit,
              size: data.size,
              time: normalizedEntryTime || data.time,
              violations: JSON.stringify(violations),
              realized_pl: realizedPl?.toFixed(2) || null,
              violation_cost: violationCost.toFixed(2),
              discipline_score: disciplineScore,
              user_id: user.id,
              float_shares: null,
              market_cap: null,
              sector: null,
              day_volume: null,
              avg_volume: null,
              relative_volume: null,
              ai_review: null,
              ai_replay: null,
              setup_quality: null
            }])
            .select();

          if (error) {
            console.error("Error saving screenshot trade:", error);
          } else if (insertedTrade && insertedTrade.length > 0) {
            dbId = insertedTrade[0].id;
          }
        }

        // Precomputed P&L
        let computedPL: string | null;
        if (realizedPl !== null && !isNaN(realizedPl)) {
          computedPL = realizedPl.toFixed(2);
        } else {
          const fallbackPL = computePLValue({
            entry_price: data.entry,
            exit_price: data.exit,
            size: data.size,
            direction: 'long'
          });
          computedPL = fallbackPL !== null ? fallbackPL.toFixed(2) : null;
        }

        // Precomputed hold time
        const holdTime = computeHoldTime(normalizedEntryTime, normalizedExitTime);

        const singleTrade: TradeData = {
          localId: nextLocalId(),
          id: dbId,
          ticker: data.ticker,
          direction: 'long',
          side: 'LONG',
          entry_price: data.entry,
          exit_price: data.exit,
          size: data.size,
          entry_time: normalizedEntryTime,
          exit_time: normalizedExitTime,
          timestamp: normalizedEntryTime,
          realized_pl: computedPL,
          holdTime,
          violations,
          violationsCount: violations.length,
          discipline_score: disciplineScore,
          violation_cost: violationCost.toFixed(2),
          displayTime: resultEntryTime,
          chartData: null,
          tradeMetrics: null,
          aiReview: null,
          aiReviewGeneratedAt: null,
          behaviorTags: [] as string[],
          behaviorSeverity: 'low',
          behaviorSummary: '',
          rawData: data
        };

        // ── Compute behavior tags instantly ──
        const ctx = computeTaggingContext([singleTrade]);
        const input: TradeBehaviorInput = {
          ticker: singleTrade.ticker,
          side: singleTrade.side,
          entry_price: singleTrade.entry_price,
          exit_price: singleTrade.exit_price,
          size: singleTrade.size,
          entry_time: singleTrade.entry_time,
          exit_time: singleTrade.exit_time,
          holdTime: singleTrade.holdTime,
          realized_pl: singleTrade.realized_pl,
          violations: singleTrade.violations,
          discipline_score: singleTrade.discipline_score,
          tradeMetrics: singleTrade.tradeMetrics || undefined,
        };
        const behaviors = tagTrade(input, ctx);
        setTrades([{
          ...singleTrade,
          behaviorTags: behaviors.tags,
          behaviorSeverity: behaviors.severity,
          behaviorSummary: behaviors.summary,
        }]);
        setSelectedTradeIndex(0);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to process file: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
      setAnalysisPhase(null);
    }
  }

  // ─── Derived selected trade ───
  const selectedTrade = selectedTradeIndex !== null && selectedTradeIndex < trades.length
    ? trades[selectedTradeIndex]
    : null;

  // ─── Memoized Trader Analytics ───
  const traderAnalytics = useMemo<TraderInsights | null>(() => {
    // Always compute analytics when trades are available
    if (trades.length < 1) return null;

    const profile = buildTraderProfile(trades as AnalyticsTrade[]);
    const insights = generateInsights(profile);
    return insights;
  }, [trades]);

  // ─── Memoized Behavior Report ───
  const behaviorReport = useMemo<BehaviorReport | null>(() => {
    // Analyze patterns starting from 2 trades
    if (trades.length < 2) return null;

    const report = buildBehaviorReport(trades as BehaviorTrade[]);
    return report;
  }, [trades]);

  // ─── Memoized Coach-Ready Output ───
  const coachOutput = useMemo<CoachReadyOutput | null>(() => {
    if (!behaviorReport) return null;
    return buildCoachReadyOutput(behaviorReport);
  }, [behaviorReport]);

  // ─── Memoized Trader Profile State (Part 1: Persistent Coach Profile) ───
  const traderProfileState = useMemo<TraderProfileState | null>(() => {
    if (trades.length < 1) return null;
    return calculateTraderProfile(trades as ProfileTrade[]);
  }, [trades]);

  // ─── Memoized Behavior Trends (Part 2: Improvement Tracking) ───
  const behaviorTrends = useMemo<BehaviorTrend[]>(() => {
    if (trades.length < 3) return [];
    return detectBehaviorTrends(trades as ProfileTrade[]);
  }, [trades]);

  // ─── Render ───
  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{
        background: 'linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)',
        backgroundImage: `
          linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)
        `,
        backgroundSize: '40px 40px, 40px 40px, 100% 100%',
      }}
    >
      {/* orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-emerald-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-green-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-lime-500 opacity-10 blur-[160px]" />
      </div>

      {/* Minimal navbar */}
      <nav className="flex items-center justify-between px-10 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Baywater</span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-sm text-white/50">{user.email}</span>
              <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
                History
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <a href="/login" className="text-sm text-white/70 hover:text-white">
                Log in
              </a>
              <a
                href="/login"
                className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
              >
                Sign up
              </a>
            </>
          )}
        </div>
      </nav>

      {/* Main content */}
      <div className="relative z-10 mx-auto max-w-2xl space-y-6 px-6 pb-20 pt-10">
        <div>
          <h1 className="text-3xl font-bold">Analyze Your Trades</h1>
          <p className="text-white/60">
            {loading && analysisPhase ? (
              <span className="flex items-center gap-2 text-emerald-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                {analysisPhase}
              </span>
            ) : loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                Processing trades...
              </span>
            ) : trades.length === 0 ? (
              'Upload a CSV or screenshot to begin analyzing your trading.'
            ) : (
              <span>
                {trades.length} trade{trades.length !== 1 ? 's' : ''} loaded{traderProfileState ? ` — Profile score: ${traderProfileState.improvementScore}/100` : ''}
              </span>
            )}
          </p>
        </div>

        {/* Section Navigation Tabs */}
        {trades.length >= 1 && (
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl" role="tablist">
            {[
              { id: 'trades' as const, label: 'Trades', icon: '📊' },
              { id: 'profile' as const, label: 'Profile', icon: '👤' },
              { id: 'coach' as const, label: 'Coach', icon: '🎯' },
              { id: 'analytics' as const, label: 'Analytics', icon: '📈' },
            ].map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeSection === tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  activeSection === tab.id
                    ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {!user && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-300">
            You&apos;re using Baywater as a guest — trades won&apos;t be saved.{" "}
            <a
              href="/login"
              className="font-semibold text-emerald-400 underline underline-offset-2 hover:text-white"
            >
              Log in to save your history.
            </a>
          </div>
        )}

        {/* Rules Card (visible under Trades tab) */}
        {activeSection === 'trades' && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Your Trading Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-white/60">Maximum Float</label>
              <Input
                type="text"
                inputMode="numeric"
                value={floatDisplay}
                onChange={handleFloatChange}
                className="border-white/10 bg-white/5 text-white mt-1"
                placeholder="10,000,000"
              />
              <p className="text-xs text-white/30 mt-1">
                (Display only – not auto‑checked)
              </p>
            </div>

            <div>
              <label className="text-sm text-white/60">Price Range ($)</label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  value={rules.minPrice}
                  onChange={(e) => setRules({ ...rules, minPrice: Number(e.target.value) })}
                  className="border-white/10 bg-white/5 text-white w-24"
                  placeholder="Min"
                />
                <span className="text-white/40">&ndash;</span>
                <Input
                  type="number"
                  value={rules.maxPrice}
                  onChange={(e) => setRules({ ...rules, maxPrice: Number(e.target.value) })}
                  className="border-white/10 bg-white/5 text-white w-24"
                  placeholder="Max"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rules.tradeBefore9AM}
                onChange={(e) => setRules({ ...rules, tradeBefore9AM: e.target.checked })}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500"
              />
              <label className="text-sm text-white/60">
                Only allow trades before 9:00 AM
              </label>
            </div>
          </CardContent>
        </Card>
        )}

        {/* ─── Trader Profile Section (shown under Profile tab) ─── */}
        {activeSection === 'profile' && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white/80">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              Trader Profile
            </h2>
            {traderAnalytics ? (
            <>
            <p className="text-sm text-white/40 -mt-3">
              Derived from {traderAnalytics.statistics.totalTrades} completed trade{traderAnalytics.statistics.totalTrades !== 1 ? 's' : ''}
            </p>

            {/* Card 1: Performance */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-white/40">Trades</div>
                    <div className="text-xl font-bold text-white">{traderAnalytics.statistics.totalTrades}</div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Win Rate</div>
                    <div className={`text-xl font-bold ${traderAnalytics.statistics.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {traderAnalytics.statistics.winRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">P&amp;L</div>
                    <div className={`text-xl font-bold tabular-nums ${traderAnalytics.statistics.totalProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {traderAnalytics.statistics.totalProfitLoss >= 0 ? '+' : ''}${traderAnalytics.statistics.totalProfitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Profit Factor</div>
                    <div className={`text-xl font-bold ${traderAnalytics.statistics.profitFactor >= 1.5 ? 'text-emerald-400' : traderAnalytics.statistics.profitFactor < 1 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {traderAnalytics.statistics.profitFactor === 999 ? '\u221e' : traderAnalytics.statistics.profitFactor.toFixed(1)}
                    </div>
                  </div>
                </div>
                {/* Discipline bar */}
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="text-xs text-white/40">Discipline</div>
                    <div className={`text-xs font-semibold ${traderAnalytics.statistics.averageDisciplineScore >= 80 ? 'text-emerald-400' : traderAnalytics.statistics.averageDisciplineScore >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {traderAnalytics.statistics.averageDisciplineScore}/100
                    </div>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${traderAnalytics.statistics.averageDisciplineScore >= 80 ? 'bg-emerald-500' : traderAnalytics.statistics.averageDisciplineScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${traderAnalytics.statistics.averageDisciplineScore}%` }}
                    />
                  </div>
                  <div className="text-xs text-white/30">
                    {traderAnalytics.statistics.totalViolations} violation{traderAnalytics.statistics.totalViolations !== 1 ? 's' : ''}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Trading Style */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">Trading Style</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-white/40">Long Trades</div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-emerald-400">{traderAnalytics.statistics.longTrades}</span>
                      {traderAnalytics.statistics.longTrades > 0 && (
                        <span className={`text-xs font-medium ${traderAnalytics.statistics.longWinRate >= 50 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                          {traderAnalytics.statistics.longWinRate}% WR
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Short Trades</div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-red-400">{traderAnalytics.statistics.shortTrades}</span>
                      {traderAnalytics.statistics.shortTrades > 0 && (
                        <span className={`text-xs font-medium ${traderAnalytics.statistics.shortWinRate >= 50 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                          {traderAnalytics.statistics.shortWinRate}% WR
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Best Side</div>
                    <div className="text-lg font-bold text-white">
                      {traderAnalytics.statistics.longWinRate > traderAnalytics.statistics.shortWinRate ? (
                        <span className="text-emerald-400">LONG</span>
                      ) : traderAnalytics.statistics.shortWinRate > traderAnalytics.statistics.longWinRate ? (
                        <span className="text-red-400">SHORT</span>
                      ) : (
                        <span className="text-white/70">Even</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/40">Avg Hold</div>
                    <div className="text-lg font-bold text-white">{traderAnalytics.statistics.averageHoldTime}</div>
                  </div>
                </div>
                {/* Most traded tickers */}
                {traderAnalytics.statistics.mostTradedTickers.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-white/40 mr-1">Most traded:</span>
                    {traderAnalytics.statistics.mostTradedTickers.map((ticker) => (
                      <span key={ticker} className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">
                        {ticker}
                      </span>
                    ))}
                  </div>
                )}
                {/* Position size */}
                {traderAnalytics.statistics.averagePositionSize > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-xs text-white/40">Avg position size:</span>
                    <span className="text-xs font-medium text-white/70">{traderAnalytics.statistics.averagePositionSize} shares</span>
                  </div>
                )}
                {/* Entry hour */}
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs text-white/40">Avg entry time:</span>
                  <span className="text-xs font-medium text-white/70">{traderAnalytics.statistics.averageEntryHour}</span>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Strengths */}
            <Card className="border border-emerald-500/20 bg-emerald-500/[0.04] backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                  <TrendingUp className="h-4 w-4" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                {traderAnalytics.strengths.length > 0 ? (
                  <ul className="space-y-2">
                    {traderAnalytics.strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                        <span className="mt-0.5 shrink-0 text-emerald-400">&#10003;</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-white/40 italic">Not enough data to identify strengths yet — keep trading.</p>
                )}
              </CardContent>
            </Card>

            {/* Card 4: Weaknesses */}
            <Card className="border border-red-500/20 bg-red-500/[0.04] backdrop-blur-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-red-400 uppercase tracking-wider">
                  <TrendingDown className="h-4 w-4" />
                  Weaknesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {traderAnalytics.weaknesses.length > 0 ? (
                  <ul className="space-y-2">
                    {traderAnalytics.weaknesses.map((weakness, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                        <span className="mt-0.5 shrink-0 text-red-400">&#9888;</span>
                        <span>{weakness}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-white/40 italic">No significant weaknesses detected — strong trading profile.</p>
                )}
              </CardContent>
            </Card>

            {/* Tendencies */}
            {traderAnalytics.tendencies.length > 0 && (
              <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">Patterns &amp; Tendencies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {traderAnalytics.tendencies.map((tendency, i) => (
                      <span key={i} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                        {tendency}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            </>
            ) : (
              <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardContent className="py-6">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <BarChart3 className="h-8 w-8 text-white/20" />
                    <p className="text-sm text-white/40">Upload more trades to build your trader profile.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ─── Behavior Intelligence Section (shown under Analytics tab) ─── */}
        {activeSection === 'analytics' && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white/80">
              <Target className="h-5 w-5 text-emerald-400" />
              Behavior Intelligence
            </h2>
            <p className="text-sm text-white/40 -mt-3">
              Detected patterns from {trades.length} trade{trades.length !== 1 ? 's' : ''}
            </p>

            {behaviorReport && (behaviorReport.strengths.length > 0 || behaviorReport.weaknesses.length > 0) ? (
              <>
            {/* Biggest Strengths */}
            {behaviorReport.strengths.length > 0 && (
              <Card className="border border-emerald-500/20 bg-emerald-500/[0.04] backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-400 uppercase tracking-wider">
                    <TrendingUp className="h-4 w-4" />
                    Biggest Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {behaviorReport.strengths.map((pattern) => (
                      <li key={pattern.id} className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                          <span className="text-xs text-emerald-400">&#10003;</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{pattern.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                              pattern.severity === 'high' ? 'bg-emerald-500/20 text-emerald-300' :
                              pattern.severity === 'medium' ? 'bg-emerald-500/15 text-emerald-300/80' :
                              'bg-white/10 text-white/50'
                            }`}>
                              {pattern.evidence.percentage ? `${pattern.evidence.percentage}%` : `${pattern.evidence.tradeCount} trades`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-white/50 leading-relaxed">{pattern.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Biggest Leaks (Weaknesses) */}
            {behaviorReport.weaknesses.length > 0 && (
              <Card className="border border-red-500/20 bg-red-500/[0.04] backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold text-red-400 uppercase tracking-wider">
                    <TrendingDown className="h-4 w-4" />
                    Biggest Leaks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {behaviorReport.weaknesses.map((pattern) => (
                      <li key={pattern.id} className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full ${
                          pattern.severity === 'high' ? 'bg-red-500/30' :
                          pattern.severity === 'medium' ? 'bg-amber-500/20' :
                          'bg-white/10'
                        }`}>
                          <span className={`text-xs ${
                            pattern.severity === 'high' ? 'text-red-400' :
                            pattern.severity === 'medium' ? 'text-amber-400' :
                            'text-white/50'
                          }`}>&#9888;</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{pattern.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                              pattern.severity === 'high' ? 'bg-red-500/20 text-red-300' :
                              pattern.severity === 'medium' ? 'bg-amber-500/15 text-amber-300' :
                              'bg-white/10 text-white/50'
                            }`}>
                              {pattern.severity === 'high' ? 'High impact' : pattern.severity === 'medium' ? 'Medium' : 'Low'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-white/50 leading-relaxed">{pattern.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Trading Tendencies */}
            {behaviorReport.patterns.filter(p => p.category === 'tendency').length > 0 && (
              <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">
                    Trading Tendencies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {behaviorReport.patterns.filter(p => p.category === 'tendency').map((pattern) => (
                      <div
                        key={pattern.id}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
                      >
                        <div className="text-xs font-medium text-white/80">{pattern.title}</div>
                        <div className="mt-0.5 text-xs text-white/40 leading-relaxed">{pattern.description}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Coach Data (hidden, feeds into future coaching pipeline) */}
            {coachOutput && (
              <script
                type="application/json"
                id="baywater-coach-output"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(coachOutput) }}
              />
            )}
            </>
            ) : (
              <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardContent className="py-6">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <BarChart3 className="h-8 w-8 text-white/20" />
                    <p className="text-sm text-white/40">
                      {trades.length < 2
                        ? 'Upload more trades to unlock behavioral pattern detection.'
                        : 'No behavioral patterns detected yet. Upload more trades to unlock deeper insights.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ─── Coach Dashboard (shown under Coach tab) ─── */}
        {activeSection === 'coach' && (
          traderProfileState ? (
          <TradingCoach
            profile={traderProfileState}
            trends={behaviorTrends}
          />
          ) : (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <Target className="h-8 w-8 text-white/20" />
                <p className="text-sm text-white/40">Upload more trades to generate coaching insights.</p>
              </div>
            </CardContent>
          </Card>
          )
        )}

        {/* Upload Card (visible under Trades tab) */}
        {activeSection === 'trades' && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Upload Trade Screenshot or CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              accept="image/*,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border-white/10 bg-white/5 text-white/50 file:text-white"
            />
            <Button
              onClick={handleUpload}
              disabled={loading}
              className="bg-emerald-500 text-white hover:bg-emerald-400"
            >
              {loading ? "Analyzing..." : "Analyze Trades"}
            </Button>
          </CardContent>
        </Card>
        )}

        {/* ─── Trade List (visible under Trades tab) ─── */}
        {trades.length > 0 && activeSection === 'trades' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white/80">
              Extracted Trades ({trades.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {trades.map((trade, idx) => {
                const isSelected = selectedTradeIndex === idx;
                const isProfitable = trade.realized_pl !== null && trade.realized_pl !== 'null' && parseFloat(trade.realized_pl) > 0;
                const plDisplay = formatPL(trade.realized_pl);
                const isShort = trade.side === 'SHORT';

                return (
                  <button
                    key={trade.localId}
                    onClick={() => setSelectedTradeIndex(idx)}
                    className={`
                      relative flex flex-col rounded-xl border px-4 py-3.5 text-left transition-all duration-200
                      ${isSelected
                        ? 'border-emerald-500/60 bg-emerald-500/15 shadow-lg shadow-emerald-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }
                    `}
                  >
                    {/* Row 1: Ticker + Side badge + P&L */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`
                          flex h-8 w-8 items-center justify-center rounded-lg
                          ${isShort
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                          }
                        `}>
                          {isShort
                            ? <TrendingDown className="h-4 w-4" />
                            : <TrendingUp className="h-4 w-4" />
                          }
                        </div>
                        <div>
                          <span className="font-semibold text-white">{trade.ticker}</span>
                          <span className={`
                            ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium
                            ${isShort
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                            }
                          `}>
                            {trade.side}
                          </span>
                        </div>
                      </div>
                      <div className={`
                        shrink-0 text-right text-base font-bold tabular-nums
                        ${isProfitable ? 'text-emerald-400' : plDisplay === '\u2014' ? 'text-white/40' : 'text-red-400'}
                      `}>
                        {plDisplay}
                      </div>
                    </div>

                    {/* Row 2: Shares + Hold time + Violations */}
                    <div className="mt-2 flex items-center gap-3 text-xs text-white/50">
                      <span className="tabular-nums">{trade.size || '0'} shares</span>
                      <span className="text-white/20">|</span>
                      <span className="tabular-nums">Held {trade.holdTime}</span>
                      {trade.violationsCount > 0 && (
                        <>
                          <span className="text-white/20">|</span>
                          <span className="text-red-400 font-medium">
                            {trade.violationsCount} {trade.violationsCount === 1 ? 'violation' : 'violations'}
                          </span>
                        </>
                      )}
                      {trade.violationsCount === 0 && (
                        <>
                          <span className="text-white/20">|</span>
                          <span className="text-emerald-400/70">0 violations</span>
                        </>
                      )}
                    </div>

                    {/* Row 3: Behavior tags */}
                    {trade.behaviorTags && trade.behaviorTags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {trade.behaviorTags.slice(0, 3).map((tag: string) => {
                          const isNegative = ['Chased Entry', 'Late Entry', 'Exited Too Early', 'Held Loser Too Long', 'Oversized Position', 'Repeated Ticker', 'Rule Violation', 'Dangerous Win'].includes(tag);
                          return (
                            <span
                              key={tag}
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                isNegative
                                  ? 'bg-amber-500/15 text-amber-300'
                                  : 'bg-emerald-500/15 text-emerald-300'
                              }`}
                            >
                              {tag}
                            </span>
                          );
                        })}
                        {trade.behaviorTags.length > 3 && (
                          <span className="text-[10px] text-white/30">+{trade.behaviorTags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Behavioral Intelligence Section (uses aggregated behavior tags, under Analytics) */}
        {trades.length >= 2 && activeSection === 'analytics' && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white/80">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              Behavioral Intelligence
            </h2>
            <BehaviorDashboard trades={trades as DashboardTrade[]} />
          </div>
        )}

        {/* ─── Selected Trade Detail (visible under Trades tab) ─── */}
        {selectedTrade && activeSection === 'trades' && (
          <>
            {/* Trade Summary Card */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <span>{selectedTrade.ticker}</span>
                    <span className={`
                      rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${selectedTrade.side === 'SHORT'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                      }
                    `}>
                      {selectedTrade.side}
                    </span>
                  </CardTitle>
                  <div className={`
                    text-lg font-bold tabular-nums
                    ${selectedTrade.realized_pl && selectedTrade.realized_pl !== 'null' && parseFloat(selectedTrade.realized_pl) > 0
                      ? 'text-emerald-400'
                      : selectedTrade.realized_pl && selectedTrade.realized_pl !== 'null' && parseFloat(selectedTrade.realized_pl) < 0
                        ? 'text-red-400'
                        : 'text-white/60'
                    }
                  `}>
                    {formatPL(selectedTrade.realized_pl)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <DollarSign className="h-3 w-3" />
                      <span>Entry</span>
                    </div>
                    <div className="text-sm font-medium text-white">
                      ${selectedTrade.entry_price ? parseFloat(selectedTrade.entry_price).toFixed(2) : '\u2014'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <Target className="h-3 w-3" />
                      <span>Exit</span>
                    </div>
                    <div className="text-sm font-medium text-white">
                      ${selectedTrade.exit_price ? parseFloat(selectedTrade.exit_price).toFixed(2) : '\u2014'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <BarChart3 className="h-3 w-3" />
                      <span>Size</span>
                    </div>
                    <div className="text-sm font-medium text-white">
                      {selectedTrade.size || '\u2014'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <Clock className="h-3 w-3" />
                      <span>Time</span>
                    </div>
                    <div className="text-sm font-medium text-white">
                      {selectedTrade.displayTime || '\u2014'}
                    </div>
                  </div>
                </div>

                {selectedTrade.violations.length > 0 && (
                  <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <h4 className="mb-1 text-sm font-semibold text-red-400">
                      Violations ({selectedTrade.violations.length})
                    </h4>
                    <ul className="space-y-1 text-sm text-red-300">
                      {selectedTrade.violations.map((v: string, i: number) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                    {selectedTrade.discipline_score !== null && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-white/50">Discipline Score:</span>
                        <span className={`
                          font-semibold
                          ${selectedTrade.discipline_score >= 80 ? 'text-emerald-400' : selectedTrade.discipline_score >= 50 ? 'text-yellow-400' : 'text-red-400'}
                        `}>
                          {selectedTrade.discipline_score}/100
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {selectedTrade.violations.length === 0 && (
                  <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-sm font-medium text-emerald-400">
                      ✓ No rule violations detected
                    </p>
                    {selectedTrade.discipline_score !== null && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="text-white/50">Discipline Score:</span>
                        <span className="font-semibold text-emerald-400">{selectedTrade.discipline_score}/100</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Candlestick Chart */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle>Historical Price Action &mdash; {selectedTrade.ticker}</CardTitle>
              </CardHeader>
              <CardContent>
                {chartLoading ? (
                  <div className="flex items-center justify-center h-96">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                      <div className="text-white/60">Loading chart data...</div>
                    </div>
                  </div>
                ) : candles.length > 0 ? (
                  <div className="h-96">
                    <TradeChart
                      candles={candles}
                      ticker={selectedTrade.ticker}
                      width={undefined}
                      height={undefined}
                      entryPrice={selectedTrade.entry_price ? parseFloat(selectedTrade.entry_price) : undefined}
                      exitPrice={selectedTrade.exit_price ? parseFloat(selectedTrade.exit_price) : undefined}
                      entryTime={selectedTrade.entry_time || undefined}
                      exitTime={selectedTrade.exit_time || undefined}
                      tradeMetrics={selectedTrade.tradeMetrics ?? undefined}
                      direction={selectedTrade.direction}
                      size={selectedTrade.size ?? undefined}
                    />
                  </div>
                ) : chartError ? (
                  <div className="flex flex-col items-center justify-center text-white/40 py-12">
                    <span className="text-4xl mb-3">📊</span>
                    <p className="text-sm text-white/60">{chartError}</p>
                    <p className="text-xs text-white/30 mt-2">Historical price data unavailable for this time range.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-white/40 py-12">
                    <span className="text-4xl mb-3">📊</span>
                    <p className="text-sm text-white/60">No chart data available</p>
                    <p className="text-xs text-white/30 mt-2">Historical price data unavailable for this time period.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trade Metrics Card */}
            {selectedTrade.chartData && selectedTrade.tradeMetrics && (
              <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-400" />
                    Trade Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-white/40">MFE</div>
                      <div className="text-lg font-bold text-emerald-400">{selectedTrade.tradeMetrics.mfeDisplay}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-white/40">MAE</div>
                      <div className="text-lg font-bold text-red-400">{selectedTrade.tradeMetrics.maeDisplay}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-white/40">Best Exit</div>
                      <div className="text-lg font-bold text-white">{selectedTrade.tradeMetrics.bestExitDisplay}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs text-white/40">Missed</div>
                      <div className="text-lg font-bold text-yellow-400">{selectedTrade.tradeMetrics.missedDisplay}</div>
                    </div>
                  </div>
                  {selectedTrade.tradeMetrics.entryContext && (
                    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="text-xs text-white/40 mb-0.5">Entry Context</div>
                      <div className="text-sm font-medium text-white/80">{selectedTrade.tradeMetrics.entryContext}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI Coach Card — Structured Coaching Response */}
            <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-emerald-400" />
                  AI Coach
                </CardTitle>
              </CardHeader>
              <CardContent>
                {aiReviewLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                      <div className="text-sm text-white/60">Analyzing your trade with AI...</div>
                    </div>
                  </div>
                ) : coachingResponse ? (
                  <div className="space-y-5">
                    {/* Grade Section */}
                    <div className="flex items-center gap-4">
                      <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 72 72">
                          <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                          <circle
                            cx="36" cy="36" r="30" fill="none"
                            stroke={coachingResponse.grade?.score != null && coachingResponse.grade.score >= 70 ? '#34d399' : coachingResponse.grade?.score != null && coachingResponse.grade.score >= 40 ? '#fbbf24' : '#f87171'}
                            strokeWidth="5"
                            strokeDasharray={`${2 * Math.PI * 30}`}
                            strokeDashoffset={`${2 * Math.PI * 30 * (1 - (coachingResponse.grade?.score ?? 50) / 100)}`}
                            strokeLinecap="round"
                            className="transition-all duration-700"
                          />
                        </svg>
                        <span className={`absolute text-xl font-bold ${
                          coachingResponse.grade?.score != null && coachingResponse.grade.score >= 70 ? 'text-emerald-400' :
                          coachingResponse.grade?.score != null && coachingResponse.grade.score >= 40 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {coachingResponse.grade?.score ?? 0}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">{coachingResponse.summary}</div>
                        <div className="mt-1 text-xs text-white/50 leading-relaxed">{coachingResponse.grade?.reasoning}</div>
                      </div>
                    </div>

                    {/* What Went Well */}
                    {coachingResponse.whatWentWell != null && coachingResponse.whatWentWell.length > 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                          What You Did Well
                        </h4>
                        <ul className="space-y-1.5">
                          {coachingResponse.whatWentWell.map((item, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-sm text-white/80">
                              <span className="mt-0.5 shrink-0 text-emerald-400">&#10003;</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Mistakes */}
                    {coachingResponse.mistakes != null && coachingResponse.mistakes.length > 0 && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400">
                          Mistakes
                        </h4>
                        <ul className="space-y-1.5">
                          {coachingResponse.mistakes.map((mistake, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-sm text-white/80">
                              <span className="mt-0.5 shrink-0 text-red-400">&#9888;</span>
                              <span>{mistake}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Behavioral Insights */}
                    {coachingResponse.behavioralInsight != null && coachingResponse.behavioralInsight.length > 0 && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                          Behavioral Insight
                        </h4>
                        <ul className="space-y-1.5">
                          {coachingResponse.behavioralInsight.map((insight, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-sm text-white/80">
                              <span className="mt-0.5 shrink-0 text-amber-400">&#9679;</span>
                              <span>{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action Items */}
                    {coachingResponse.actionItems != null && coachingResponse.actionItems.length > 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                          Next Action
                        </h4>
                        <ul className="space-y-1.5">
                          {coachingResponse.actionItems.map((item, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-sm text-white/80">
                              <span className="mt-0.5 shrink-0 text-emerald-400">&#9654;</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Coach Note */}
                    {coachingResponse.coachNote && (
                      <div className="border-t border-white/10 pt-3">
                        <p className="text-sm italic text-white/60 leading-relaxed">
                          "{coachingResponse.coachNote}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : user && selectedTrade.id ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-white/50">
                      AI coaching will be generated after analysis is complete.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-white/50">
                      Sign in to get AI-powered trade coaching.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
