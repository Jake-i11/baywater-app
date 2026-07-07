"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries } from "lightweight-charts";

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ReplayEvent {
  timestamp: string;
  title: string;
  description: string;
}

interface AIReplayChartProps {
  candles: CandleData[];
  ticker: string;
  entryPrice?: number;
  exitPrice?: number;
  entryTime?: string;
  exitTime?: string;
  isPlaying: boolean;
  playbackSpeed: number;
  currentEventIndex: number;
  onEventChange: (index: number) => void;
  replayEvents: ReplayEvent[];
}

export function AIReplayChart({
  candles,
  ticker,
  entryPrice,
  exitPrice,
  entryTime,
  exitTime,
  isPlaying,
  playbackSpeed,
  currentEventIndex,
  onEventChange,
  replayEvents
}: AIReplayChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [visibleCandles, setVisibleCandles] = useState<CandleData[]>([]);
  const [animationFrameId, setAnimationFrameId] = useState<number | null>(null);

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
      width: chartContainerRef.current.clientWidth,
      height: 500,
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

    // Start with first candle hidden
    if (candles.length > 0) {
      setVisibleCandles([candles[0]]);
    }

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
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles]);

  useEffect(() => {
    if (!isPlaying || !seriesRef.current || visibleCandles.length >= candles.length) return;

    let animationFrameId: number;
    let frameCount = 0;
    const totalFrames = 60; // Animation duration in frames
    const startCandleIndex = visibleCandles.length;
    const endCandleIndex = Math.min(startCandleIndex + 10, candles.length); // Reveal up to 10 candles ahead

    const animate = () => {
      frameCount++;
      const progress = frameCount / totalFrames;

      // Calculate how many candles to reveal based on progress and speed
      const candlesToReveal = Math.floor(progress * (endCandleIndex - startCandleIndex));

      if (candlesToReveal > 0) {
        const newVisibleCandles = candles.slice(0, startCandleIndex + candlesToReveal);
        setVisibleCandles(newVisibleCandles);
        seriesRef.current?.setData(newVisibleCandles);

        // Check if we've reached an event timestamp
        const currentTime = new Date(newVisibleCandles[newVisibleCandles.length - 1].time).getTime();
        replayEvents.forEach((event, index) => {
          const eventTime = new Date(event.timestamp).getTime();
          if (Math.abs(currentTime - eventTime) < 30000 && index > currentEventIndex) {
            onEventChange(index);
          }
        });
      }

      if (frameCount < totalFrames && visibleCandles.length < endCandleIndex) {
        animationFrameId = requestAnimationFrame(animate);
        setAnimationFrameId(animationFrameId);
      } else {
        // Move to next segment if not at end
        if (visibleCandles.length < candles.length) {
          frameCount = 0;
          animationFrameId = requestAnimationFrame(animate);
          setAnimationFrameId(animationFrameId);
        }
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    setAnimationFrameId(animationFrameId);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, visibleCandles, candles, replayEvents, currentEventIndex, onEventChange]);

  useEffect(() => {
    // Update visible candles when current event changes
    if (currentEventIndex < replayEvents.length && seriesRef.current) {
      const eventTime = new Date(replayEvents[currentEventIndex].timestamp);
      const eventCandleIndex = candles.findIndex(candle => {
        const candleTime = new Date(candle.time);
        return Math.abs(candleTime.getTime() - eventTime.getTime()) < 30000;
      });

      if (eventCandleIndex !== -1) {
        const candlesToShow = Math.min(eventCandleIndex + 1, candles.length);
        const newVisibleCandles = candles.slice(0, candlesToShow);
        setVisibleCandles(newVisibleCandles);
        seriesRef.current.setData(newVisibleCandles);
      }
    }
  }, [currentEventIndex, candles, replayEvents]);

  // Add entry/exit markers
  useEffect(() => {
    if (!chartRef.current || !entryPrice || !exitPrice) return;

    // Find candle indices for entry and exit
    let entryCandleIndex = 0;
    let exitCandleIndex = candles.length - 1;

    if (entryTime) {
      const entryDate = new Date(entryTime);
      entryCandleIndex = candles.findIndex(c => {
        const candleDate = new Date(c.time);
        return Math.abs(candleDate.getTime() - entryDate.getTime()) < 30000;
      });
      if (entryCandleIndex === -1) entryCandleIndex = 0;
    }

    if (exitTime) {
      const exitDate = new Date(exitTime);
      exitCandleIndex = candles.findIndex(c => {
        const candleDate = new Date(c.time);
        return Math.abs(candleDate.getTime() - exitDate.getTime()) < 30000;
      });
      if (exitCandleIndex === -1) exitCandleIndex = candles.length - 1;
    }

    // Create price line series for entry (green)
    const entryLineSeries = chartRef.current.addSeries({
      type: 'Line',
      lineWidth: 2,
    } as any);

    // Create price line series for exit (red)
    const exitLineSeries = chartRef.current.addSeries({
      type: 'Line',
      lineWidth: 2,
    } as any);

    // Add markers at specific positions
    if (entryCandleIndex >= 0 && entryCandleIndex < candles.length) {
      entryLineSeries.setData([
        { time: candles[entryCandleIndex].time, value: entryPrice }
      ]);
    }

    if (exitCandleIndex >= 0 && exitCandleIndex < candles.length) {
      exitLineSeries.setData([
        { time: candles[exitCandleIndex].time, value: exitPrice }
      ]);
    }

    return () => {
      // Cleanup will be handled by chart removal
    };
  }, [chartRef.current, entryPrice, exitPrice, entryTime, exitTime, candles]);

  if (candles.length === 0) {
    return <div className="text-white/60 text-sm">No chart data available</div>;
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-2 left-2 z-10 bg-black/30 px-2 py-1 rounded text-white text-sm font-semibold">
        {ticker} - {isPlaying ? 'Playing' : 'Paused'}
      </div>
      <div ref={chartContainerRef} className="w-full h-full" />
      {currentEventIndex < replayEvents.length && (
        <div className="absolute bottom-4 left-4 z-10 bg-black/50 px-3 py-2 rounded text-white text-sm max-w-xs">
          <strong>{replayEvents[currentEventIndex].title}</strong>
          <p className="text-xs text-white/80 mt-1">
            {replayEvents[currentEventIndex].description}
          </p>
        </div>
      )}
    </div>
  );
}