"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries } from "lightweight-charts";

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
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
}

  export function TradeChart({ candles, ticker, width = 600, height = 400, entryPrice, exitPrice, entryTime, exitTime }: TradeChartProps) {
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

    // Create new chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        textColor: "white",
        background: { type: ColorType.Solid, color: "transparent" },
      },
      width: width,
      height: height,
      grid: {
        vertLines: { color: "rgba(42, 46, 50, 0.5)" },
        horzLines: { color: "rgba(42, 46, 50, 0.5)" },
      },
    });
    chart.timeScale().fitContent();

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    }) as ISeriesApi<"Candlestick">;

    // Set the data
    candlestickSeries.setData(candles);

    // Add entry/exit markers if prices are provided
    if (entryPrice !== undefined && exitPrice !== undefined) {
      // Find the candle closest to entry time for positioning
      let entryCandleIndex = Math.floor(candles.length / 3);
      let exitCandleIndex = Math.floor(candles.length * 2 / 3);

      // If we have specific times, try to find matching candles
      if (entryTime && candles.length > 0) {
        const entryDate = new Date(entryTime);
        entryCandleIndex = candles.findIndex(c => {
          const candleDate = new Date(c.time);
          return Math.abs(candleDate.getTime() - entryDate.getTime()) < 300000; // within 5 minutes
        });
        if (entryCandleIndex === -1) entryCandleIndex = Math.floor(candles.length / 3);
      }

      if (exitTime && candles.length > 0) {
        const exitDate = new Date(exitTime);
        exitCandleIndex = candles.findIndex(c => {
          const candleDate = new Date(c.time);
          return Math.abs(candleDate.getTime() - exitDate.getTime()) < 300000; // within 5 minutes
        });
        if (exitCandleIndex === -1) exitCandleIndex = Math.floor(candles.length * 2 / 3);
      }

      // Ensure indices are within bounds
      entryCandleIndex = Math.max(0, Math.min(entryCandleIndex, candles.length - 1));
      exitCandleIndex = Math.max(0, Math.min(exitCandleIndex, candles.length - 1));

      // Create price line series for entry (green)
      const entryLineSeries = chart.addSeries({
        type: 'Line',
        lineWidth: 2,
      } as any); // Temporary workaround for API changes

      // Create price line series for exit (red)
      const exitLineSeries = chart.addSeries({
        type: 'Line',
        lineWidth: 2,
      } as any); // Temporary workaround for API changes

      // Add markers at specific positions
      entryLineSeries.setData([
        { time: candles[entryCandleIndex].time, value: entryPrice }
      ]);

      exitLineSeries.setData([
        { time: candles[exitCandleIndex].time, value: exitPrice }
      ]);
    }

    // Add title
    chart.applyOptions({
      localization: {
        priceFormatter: (price: number) => price.toFixed(2),
      },
    });

    // Store references for cleanup
    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
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
  }, [candles, width, height]);

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