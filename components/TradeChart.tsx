"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  UTCTimestamp,
} from "lightweight-charts";
import type { SeriesMarker } from "lightweight-charts";

// ── Market Structure Constants ───────────────────────────────────────
const OPENING_RANGE_MINUTES = 5;
const PREMARKET_START_ET = 4.0;   // 4:00 AM Eastern
const MARKET_OPEN_ET = 9.5;        // 9:30 AM Eastern

interface MarketLevels {
  premarketHigh: number | null;
  premarketLow: number | null;
  orHigh: number | null;
  orLow: number | null;
}

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface TradeMetricsResult {
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

interface TradeChartProps {
  candles: CandleData[];
  ticker: string;
  width?: number;
  height?: number;
  entryPrice?: number;
  exitPrice?: number;
  entryTime?: string;
  exitTime?: string;
  tradeMetrics?: TradeMetricsResult;
  direction?: string;
  size?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert an ISO time string to a UTCTimestamp (seconds since epoch). */
function toUTC(timeStr: string): UTCTimestamp {
  return Math.floor(new Date(timeStr).getTime() / 1000) as UTCTimestamp;
}

/**
 * Find the candle index whose time is within `toleranceMs` of the target.
 */
function findCandleByTime(
  candles: CandleData[],
  targetTimeStr: string,
  toleranceMs = 300_000
): number {
  const targetMs = new Date(targetTimeStr).getTime();
  if (isNaN(targetMs)) return -1;
  return candles.findIndex((c) => {
    const cMs = new Date(c.time).getTime();
    return Math.abs(cMs - targetMs) < toleranceMs;
  });
}

/** Format a time string for display in a chart marker label. */
function formatTimeForLabel(timeStr: string): string {
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Market Structure Helpers ──────────────────────────────────────────

/**
 * Return the Eastern Time decimal hour for a candle's UTC timestamp.
 * Uses a simple DST heuristic: EDT (UTC-4) Apr–Oct, EST (UTC-5) Nov–Mar.
 * Returns -1 for unparseable timestamps.
 */
function getETDecimalHour(utcTimeStr: string): number {
  const d = new Date(utcTimeStr);
  if (isNaN(d.getTime())) return -1;
  const month = d.getUTCMonth(); // 0-indexed
  // EDT: 2nd Sun Mar – 1st Sun Nov.  Approximate with Apr–Oct inclusive.
  const isEDT = month >= 3 && month <= 9;
  const offsetHours = isEDT ? 4 : 5;
  return d.getUTCHours() - offsetHours + d.getUTCMinutes() / 60;
}

/** Calculate premarket high/low and opening-range high/low from candles. */
function calculateMarketLevels(candles: CandleData[]): MarketLevels {
  let premarketHigh = -Infinity;
  let premarketLow = Infinity;
  let hasPremarket = false;

  let orHigh = -Infinity;
  let orLow = Infinity;
  let hasOR = false;

  const orEndET = MARKET_OPEN_ET + OPENING_RANGE_MINUTES / 60;

  for (const c of candles) {
    const etHour = getETDecimalHour(c.time);
    if (etHour < 0) continue;

    // Premarket: 4:00 AM – 9:30 AM ET
    if (etHour >= PREMARKET_START_ET && etHour < MARKET_OPEN_ET) {
      if (c.high > premarketHigh) premarketHigh = c.high;
      if (c.low < premarketLow) premarketLow = c.low;
      hasPremarket = true;
    }

    // Opening Range: 9:30 – 9:30+OPENING_RANGE_MINUTES ET
    if (etHour >= MARKET_OPEN_ET && etHour < orEndET) {
      if (c.high > orHigh) orHigh = c.high;
      if (c.low < orLow) orLow = c.low;
      hasOR = true;
    }
  }

  return {
    premarketHigh: hasPremarket ? premarketHigh : null,
    premarketLow: hasPremarket ? premarketLow : null,
    orHigh: hasOR ? orHigh : null,
    orLow: hasOR ? orLow : null,
  };
}



// ── Component ─────────────────────────────────────────────────────────

export function TradeChart({
  candles,
  ticker,
  width = 600,
  height = 400,
  entryPrice,
  exitPrice,
  entryTime,
  exitTime,
  tradeMetrics,
  direction,
  size,
}: TradeChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // ── Create chart ────────────────────────────────────────────────
    const chart = createChart(chartContainerRef.current, {
      layout: {
        textColor: "white",
        background: { type: ColorType.Solid, color: "transparent" },
      },
      width,
      height,
      grid: {
        vertLines: { color: "rgba(42, 46, 50, 0.5)" },
        horzLines: { color: "rgba(42, 46, 50, 0.5)" },
      },
    });
    chart.timeScale().fitContent();

    // ── Candlestick series ──────────────────────────────────────────
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    }) as ISeriesApi<"Candlestick">;

    const transformedCandles = candles.map((c) => ({
      time: toUTC(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candlestickSeries.setData(transformedCandles);

    // ── Locate entry / exit candle indices ──────────────────────────
    let entryIdx = -1;
    let exitIdx = -1;

    if (entryTime) {
      entryIdx = findCandleByTime(candles, entryTime);
      if (entryIdx === -1) entryIdx = Math.floor(candles.length / 3);
    }
    if (exitTime) {
      exitIdx = findCandleByTime(candles, exitTime);
      if (exitIdx === -1) exitIdx = Math.floor((candles.length * 2) / 3);
    }

    entryIdx = Math.max(0, Math.min(entryIdx, candles.length - 1));
    exitIdx = Math.max(0, Math.min(exitIdx, candles.length - 1));

    const isShort = direction?.toLowerCase() === "short";

    // ── Markers plugin ──────────────────────────────────────────────
    const markersPlugin = createSeriesMarkers(candlestickSeries, [], {
      autoScale: true,
      zOrder: "aboveSeries",
    });

    const markers: SeriesMarker<UTCTimestamp>[] = [];

    // ── Price lines (horizontal, full-width labels) ─────────────────
    if (entryPrice !== undefined && entryPrice !== null) {
      candlestickSeries.createPriceLine({
        price: entryPrice,
        color: "rgba(34, 197, 94, 0.5)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "Entry",
      });
    }

    if (exitPrice !== undefined && exitPrice !== null) {
      candlestickSeries.createPriceLine({
        price: exitPrice,
        color: "rgba(239, 68, 68, 0.5)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Exit",
      });
    }

    // ── Entry marker ────────────────────────────────────────────────
    if (entryPrice !== undefined && entryPrice !== null && entryIdx >= 0) {
      const entryLabel = entryTime
        ? `Entry $${entryPrice.toFixed(2)} ${formatTimeForLabel(entryTime)}`
        : `Entry $${entryPrice.toFixed(2)}`;

      markers.push({
        time: transformedCandles[entryIdx].time,
        position: "belowBar",
        shape: "arrowUp",
        color: "#22c55e",
        text: entryLabel,
        size: 2,
      });

      console.log("[TradeChart]");
      console.log("Entry marker created");
    }

    // ── Exit marker ─────────────────────────────────────────────────
    if (
      exitPrice !== undefined &&
      exitPrice !== null &&
      exitIdx >= 0 &&
      exitIdx !== entryIdx
    ) {
      const exitLabel = exitTime
        ? `Exit $${exitPrice.toFixed(2)} ${formatTimeForLabel(exitTime)}`
        : `Exit $${exitPrice.toFixed(2)}`;

      markers.push({
        time: transformedCandles[exitIdx].time,
        position: "aboveBar",
        shape: "arrowDown",
        color: "#ef4444",
        text: exitLabel,
        size: 2,
      });

      console.log("[TradeChart]");
      console.log("Exit marker created");
    }

    // ── Exit on same candle as entry — offset ───────────────────────
    if (
      exitPrice !== undefined &&
      exitPrice !== null &&
      exitIdx >= 0 &&
      exitIdx === entryIdx
    ) {
      const sameExitLabel = exitTime
        ? `Exit $${exitPrice.toFixed(2)} ${formatTimeForLabel(exitTime)}`
        : `Exit $${exitPrice.toFixed(2)}`;

      markers.push({
        time: transformedCandles[exitIdx].time,
        position: "aboveBar",
        shape: "square",
        color: "#ef4444",
        text: sameExitLabel,
        size: 1,
      });

      console.log("[TradeChart]");
      console.log("Exit marker created (same candle as entry)");
    }

    // ── MFE marker ──────────────────────────────────────────────────
    if (tradeMetrics?.mfe != null && entryPrice != null) {
      let mfeCandleIdx = -1;
      if (isShort) {
        let minLow = Infinity;
        for (let i = entryIdx; i <= (exitIdx >= 0 ? exitIdx : candles.length - 1); i++) {
          if (candles[i].low < minLow) {
            minLow = candles[i].low;
            mfeCandleIdx = i;
          }
        }
      } else {
        let maxHigh = -Infinity;
        for (let i = entryIdx; i <= (exitIdx >= 0 ? exitIdx : candles.length - 1); i++) {
          if (candles[i].high > maxHigh) {
            maxHigh = candles[i].high;
            mfeCandleIdx = i;
          }
        }
      }

      if (mfeCandleIdx >= 0) {
        const avoidOverlap =
          mfeCandleIdx === entryIdx || mfeCandleIdx === exitIdx
            ? "inBar"
            : "belowBar";

        markers.push({
          time: transformedCandles[mfeCandleIdx].time,
          position: avoidOverlap,
          shape: "circle",
          color: "#22c55e",
          text: `MFE ${tradeMetrics.mfeDisplay}`,
          size: 2,
        });

        console.log("[TradeChart]");
        console.log("MFE marker created");
      }
    }

    // ── MAE marker ──────────────────────────────────────────────────
    if (tradeMetrics?.mae != null && entryPrice != null) {
      let maeCandleIdx = -1;
      if (isShort) {
        let maxHigh = -Infinity;
        for (let i = entryIdx; i <= (exitIdx >= 0 ? exitIdx : candles.length - 1); i++) {
          if (candles[i].high > maxHigh) {
            maxHigh = candles[i].high;
            maeCandleIdx = i;
          }
        }
      } else {
        let minLow = Infinity;
        for (let i = entryIdx; i <= (exitIdx >= 0 ? exitIdx : candles.length - 1); i++) {
          if (candles[i].low < minLow) {
            minLow = candles[i].low;
            maeCandleIdx = i;
          }
        }
      }

      if (maeCandleIdx >= 0) {
        const isOccupied =
          maeCandleIdx === entryIdx ||
          maeCandleIdx === exitIdx;
        const position = isOccupied ? "inBar" : "aboveBar";

        markers.push({
          time: transformedCandles[maeCandleIdx].time,
          position,
          shape: "circle",
          color: "#ef4444",
          text: `MAE ${tradeMetrics.maeDisplay}`,
          size: 2,
        });

        console.log("[TradeChart]");
        console.log("MAE marker created");
      }
    }

    // ── Hold period: faint line from entry to exit ──────────────────
    if (
      entryIdx >= 0 &&
      exitIdx >= 0 &&
      exitIdx !== entryIdx &&
      entryPrice !== undefined
    ) {
      const holdLineSeries = chart.addSeries(LineSeries, {
        color: "rgba(255, 255, 255, 0.08)",
        lineWidth: 1,
        lineStyle: 2,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });

      holdLineSeries.setData([
        {
          time: transformedCandles[entryIdx].time,
          value: entryPrice,
        },
        {
          time: transformedCandles[exitIdx].time,
          value: exitPrice ?? entryPrice,
        },
      ]);
    }

    // ── Apply all markers ───────────────────────────────────────────
    if (markers.length > 0) {
      markersPlugin.setMarkers(markers);
    }

    // ── Market Structure Overlays ───────────────────────────────────
    const marketLevels = calculateMarketLevels(candles);

    console.log("[Market Levels]");

    // Premarket High
    if (marketLevels.premarketHigh !== null) {
      candlestickSeries.createPriceLine({
        price: marketLevels.premarketHigh,
        color: "rgba(100, 180, 255, 0.6)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "Premarket High",
      });
      console.log(`Premarket High: $${marketLevels.premarketHigh.toFixed(2)}`);
    } else {
      console.log("Premarket High: not available (no candles in 4:00-9:30 ET window)");
    }

    // Premarket Low
    if (marketLevels.premarketLow !== null) {
      candlestickSeries.createPriceLine({
        price: marketLevels.premarketLow,
        color: "rgba(100, 180, 255, 0.6)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "Premarket Low",
      });
      console.log(`Premarket Low: $${marketLevels.premarketLow.toFixed(2)}`);
    } else {
      console.log("Premarket Low: not available (no candles in 4:00-9:30 ET window)");
    }

    // Opening Range High
    if (marketLevels.orHigh !== null) {
      candlestickSeries.createPriceLine({
        price: marketLevels.orHigh,
        color: "rgba(255, 165, 0, 0.7)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "OR High",
      });
      console.log(`OR High: $${marketLevels.orHigh.toFixed(2)}`);
    } else {
      console.log("OR High: not available (no candles in opening range window)");
    }

    // Opening Range Low
    if (marketLevels.orLow !== null) {
      candlestickSeries.createPriceLine({
        price: marketLevels.orLow,
        color: "rgba(255, 165, 0, 0.7)",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "OR Low",
      });
      console.log(`OR Low: $${marketLevels.orLow.toFixed(2)}`);
    } else {
      console.log("OR Low: not available (no candles in opening range window)");
    }

    // ── Localization ────────────────────────────────────────────────
    chart.applyOptions({
      localization: {
        priceFormatter: (price: number) => price.toFixed(2),
      },
    });

    // ── Store refs ──────────────────────────────────────────────────
    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // ── Resize handler ──────────────────────────────────────────────
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    candles,
    width,
    height,
    entryPrice,
    exitPrice,
    entryTime,
    exitTime,
    tradeMetrics,
    direction,
    size,
  ]);

  if (candles.length === 0) {
    return <div className="text-white/60 text-sm">No chart data available</div>;
  }

  return (
    <div className="relative">
      <div className="absolute top-2 left-2 z-10 bg-black/30 px-2 py-1 rounded text-white text-sm font-semibold">
        {ticker}
      </div>
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}