"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { TradeChart } from "@/components/TradeChart";
import {
  enrichTradeWithMarketData,
  calculateViolationCost,
  calculateDisciplineScore,
  checkDangerousWin,
  generateAndStoreAIReview
} from "@/lib/market-enrichment";

function formatNumber(num: number) {
  return num.toLocaleString("en-US");
}

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

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
      const match = timeStr.match(/(\d{1,2}):?(\d{2})?/);
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

  function parseTradeTime(timeStr: string): Date {
    // Parse time strings like "9:30 AM", "10:15", etc.
    const now = new Date();
    let hours = 0;
    let minutes = 0;
    let isPM = false;

    // Match patterns like "9:30 AM", "10:15", "8 AM", etc.
    const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = match[2] ? parseInt(match[2], 10) : 0;
      isPM = (match[3]?.toUpperCase() === 'PM');

      // Convert to 24-hour format
      if (isPM && hours < 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
    }

    // Assume today's date, with the parsed time
    const tradeDate = new Date(now);
    tradeDate.setHours(hours, minutes, 0, 0);

    return tradeDate;
  }

  function parseBrokerageTimestamp(timestamp: string): Date {
    // Parse brokerage timestamps like "6/12/26 9:46a ET" or "6/12/26 9:46a"
    // Handle formats: M/D/YY H:MMa [timezone]

    // Remove timezone if present (e.g., " ET")
    const cleanTimestamp = timestamp.replace(/\s*(ET|CT|MT|PT)$/i, '').trim();

    // Match pattern: M/D/YY H:MMa
    const match = cleanTimestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})([ap])/i);
    if (!match) {
      console.warn(`Could not parse timestamp: ${timestamp}`);
      return new Date();
    }

    const [, month, day, year, hour, minute, period] = match;

    // Convert to 4-digit year (assuming 20xx)
    const fullYear = 2000 + parseInt(year, 10);

    // Convert to 24-hour format
    let hours = parseInt(hour, 10);
    if (period.toLowerCase() === 'p' && hours < 12) hours += 12;
    if (period.toLowerCase() === 'a' && hours === 12) hours = 0;

    // Create date object (assume current year if year is invalid)
    return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10), hours, parseInt(minute, 10), 0, 0);
  }

  /**
   * Pair executions into completed trades
   * @param executions Array of parsed CSV executions
   * @returns Array of completed trades with proper pairing and P/L calculations
   */
  function pairExecutionsIntoTrades(executions: any[]): any[] {
    // Filter out canceled orders
    const validExecutions = executions.filter(exec => {
      // Check if there's a cancel reason (case insensitive)
      const hasCancelReason = exec.cancelReason && exec.cancelReason.trim() !== '';
      return !hasCancelReason;
    });

    if (validExecutions.length === 0) {
      return [];
    }

    // Group executions by ticker
    const byTicker: Record<string, any[]> = {};
    validExecutions.forEach(exec => {
      if (!byTicker[exec.ticker]) {
        byTicker[exec.ticker] = [];
      }
      byTicker[exec.ticker].push(exec);
    });

    const completedTrades: any[] = [];

    // Process each ticker group
    for (const [ticker, tickerExecs] of Object.entries(byTicker)) {
      // Sort by timestamp (oldest first)
      const sortedExecs = [...tickerExecs].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      let position: {
        direction: 'short' | 'long' | null;
        entryExecutions: any[];
        totalQuantity: number;
        totalCost: number;
      } | null = null;

      for (const exec of sortedExecs) {
        const quantity = parseFloat(exec.size);
        const price = parseFloat(exec.price);
        const direction = exec.direction.toLowerCase();

        // Opening positions
        if (direction === 'short' || direction === 'buy') {
          if (position && position.direction !== null) {
            // Close existing position first (shouldn't happen with proper data)
            // This handles the case where we have multiple opening executions
            completedTrades.push(createCompletedTrade(ticker, position, null));
          }

          position = {
            direction: direction === 'short' ? 'short' : 'long',
            entryExecutions: [exec],
            totalQuantity: quantity,
            totalCost: quantity * price
          };
        }
        // Closing positions
        else if (direction === 'cover' || direction === 'sell') {
          if (!position) {
            // No open position to close - skip or create partial trade
            continue;
          }

          // Calculate how much we can close
          const closeQuantity = Math.min(quantity, position.totalQuantity);
          const closeProportion = closeQuantity / position.totalQuantity;

          // Calculate weighted average entry price
          const avgEntryPrice = position.totalCost / position.totalQuantity;

          // Calculate realized P/L
          let realizedPL = 0;
          if (position.direction === 'short') {
            // Short: profit when price decreases (entry - exit)
            realizedPL = (avgEntryPrice - price) * closeQuantity;
          } else {
            // Long: profit when price increases (exit - entry)
            realizedPL = (price - avgEntryPrice) * closeQuantity;
          }

          // Create completed trade
          const completedTrade = {
            ticker,
            direction: position.direction,
            entry_price: avgEntryPrice.toFixed(2),
            exit_price: price.toFixed(2),
            size: closeQuantity.toString(),
            entry_time: position.entryExecutions[0].timestamp,
            exit_time: exec.timestamp,
            realized_pl: realizedPL.toFixed(2),
            entry_executions: position.entryExecutions,
            exit_execution: exec,
            created_at: new Date().toISOString()
          };

          completedTrades.push(completedTrade);

          // Update position (handle partial closes)
          if (closeQuantity < position.totalQuantity) {
            // Partial close - keep remaining position
            position.totalQuantity -= closeQuantity;
            position.totalCost -= closeQuantity * avgEntryPrice;
            // Keep the original entry executions for remaining position
          } else {
            // Full close - reset position
            position = null;
          }
        }
      }

      // Handle any remaining open positions (unmatched executions)
      if (position) {
        // Don't create trades for unmatched positions
        console.warn(`Unmatched position for ${ticker}: ${position.direction} ${position.totalQuantity} shares`);
      }
    }

    return completedTrades;
  }

  /**
   * Helper function to create completed trade (used for edge cases)
   */
  function createCompletedTrade(ticker: string, position: any, exitExec: any | null): any {
    if (!position) return null;

    const totalQuantity = position.totalQuantity;
    const avgEntryPrice = position.totalCost / totalQuantity;

    return {
      ticker,
      direction: position.direction,
      entry_price: avgEntryPrice.toFixed(2),
      exit_price: exitExec ? parseFloat(exitExec.price).toFixed(2) : null,
      size: totalQuantity.toString(),
      entry_time: position.entryExecutions[0].timestamp,
      exit_time: exitExec ? exitExec.timestamp : null,
      realized_pl: exitExec ? (
        position.direction === 'short'
          ? ((avgEntryPrice - parseFloat(exitExec.price)) * totalQuantity).toFixed(2)
          : ((parseFloat(exitExec.price) - avgEntryPrice) * totalQuantity).toFixed(2)
      ) : '0.00',
      entry_executions: position.entryExecutions,
      exit_execution: exitExec,
      created_at: new Date().toISOString()
    };
  }

  function parseCSVContent(content: string): any[] {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    if (lines.length <= 1) return [];

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());

    // Find column indices
    const symbolIndex = headers.findIndex(h => h.toLowerCase().includes('symbol'));
    const orderDateIndex = headers.findIndex(h => h.toLowerCase().includes('order date'));
    const transactionDateIndex = headers.findIndex(h => h.toLowerCase().includes('transaction date'));
    const typeIndex = headers.findIndex(h => h.toLowerCase().includes('type'));
    const amountIndex = headers.findIndex(h => h.toLowerCase().includes('amount'));
    const priceIndex = headers.findIndex(h => h.toLowerCase().includes('price'));
    const cancelReasonIndex = headers.findIndex(h => h.toLowerCase().includes('cancel reason'));

    if (symbolIndex === -1 || amountIndex === -1 || priceIndex === -1) {
      console.error('CSV missing required columns');
      return [];
    }

    // Parse data rows
    const executions = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length < headers.length) continue;

      const symbol = values[symbolIndex]?.trim() || '';
      const type = values[typeIndex]?.trim() || '';
      const amountStr = values[amountIndex]?.trim() || '';
      const priceStr = values[priceIndex]?.trim() || '';
      const timestamp = values[transactionDateIndex]?.trim() || values[orderDateIndex]?.trim() || '';
      const cancelReason = cancelReasonIndex !== -1 ? values[cancelReasonIndex]?.trim() || '' : '';

      if (!symbol || !amountStr || !priceStr) continue;

      // Clean amount (remove commas)
      const amount = amountStr.replace(/,/g, '');
      const price = priceStr.replace(/[^\d.]/g, '');

      // Parse timestamp
      const tradeTime = timestamp ? parseBrokerageTimestamp(timestamp) : new Date();

      executions.push({
        ticker: symbol,
        direction: type,
        size: amount,
        price: price,
        timestamp: tradeTime.toISOString(),
        rawAmount: amountStr,
        rawPrice: priceStr,
        cancelReason: cancelReason
      });
    }

    // Pair executions into completed trades
    return pairExecutionsIntoTrades(executions);
  }

  async function fetchChartData(ticker: string, timeStr: string) {
    try {
      setChartLoading(true);
      setCandles([]);

      // Parse the trade time and create a time range
      const tradeTime = parseTradeTime(timeStr);

      // Create start and end times for the chart
      // Start: 1 hour before trade time
      // End: 1 hour after trade time
      const startTime = new Date(tradeTime);
      startTime.setHours(tradeTime.getHours() - 1);

      const endTime = new Date(tradeTime);
      endTime.setHours(tradeTime.getHours() + 1);

      const response = await fetch("/api/chart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      if (response.ok) {
        const chartData = await response.json();
        if (chartData.candles && chartData.candles.length > 0) {
          setCandles(chartData.candles);
        }
      } else {
        console.error("Failed to fetch chart data:", response.statusText);
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
    } finally {
      setChartLoading(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setCandles([]);
    setChartLoading(false);

    try {
      // Check if file is CSV
      if (file.name.endsWith('.csv')) {
        // Process CSV file
        const content = await file.text();
        const parsedTrades = parseCSVContent(content);

        if (parsedTrades.length === 0) {
          setResult({ error: "No valid trades found in CSV file" });
          setLoading(false);
          return;
        }

        // Save all parsed trades to Supabase with enhanced intelligence layer
        if (user) {
          const tradeInserts = parsedTrades.map(trade => {
            // Determine entry/exit based on direction
            let entryPrice = trade.price;
            let exitPrice = null;
            let entryTime = trade.timestamp;
            let exitTime = null;

            // For Short/Cover trades, we need to handle differently
            if (trade.direction.toLowerCase() === 'short') {
              entryPrice = trade.price;
            } else if (trade.direction.toLowerCase() === 'cover') {
              exitPrice = trade.price;
              exitTime = trade.timestamp;
            } else if (trade.direction.toLowerCase() === 'buy') {
              entryPrice = trade.price;
            } else if (trade.direction.toLowerCase() === 'sell') {
              exitPrice = trade.price;
              exitTime = trade.timestamp;
            }

            // Check rules for each trade
            let tradeViolations = checkRules({
              ticker: trade.ticker,
              price: parseFloat(entryPrice),
              time: entryTime
            });

            // Check for dangerous wins (profitable trades with violations)
            const realizedPl = trade.realized_pl ? parseFloat(trade.realized_pl) : null;
            tradeViolations = checkDangerousWin(tradeViolations, realizedPl);

            // Calculate violation cost
            const violationCost = calculateViolationCost(tradeViolations, realizedPl);

            // Calculate discipline score
            const disciplineScore = calculateDisciplineScore(tradeViolations);

            return {
              ticker: trade.ticker,
              direction: trade.direction,
              entry: entryPrice,
              exit: exitPrice,
              size: trade.size,
              entry_time: entryTime,
              exit_time: exitTime,
              time: entryTime, // For backward compatibility
              violations: JSON.stringify(tradeViolations),
              realized_pl: realizedPl?.toFixed(2) || null,
              violation_cost: violationCost.toFixed(2),
              discipline_score: disciplineScore,
              user_id: user.id,
              // Initialize new intelligence layer fields
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

          // Batch insert trades
          const { data: insertedTrades, error } = await supabase
            .from('trades')
            .insert(tradeInserts)
            .select();

          if (error) {
            console.error("Error saving CSV trades:", error);
          } else if (insertedTrades) {
            // Enrich trades with market data and generate AI reviews after successful insertion
            for (const trade of insertedTrades) {
              try {
                // Extract trade date from entry_time for market data
                const tradeDate = trade.entry_time ? new Date(trade.entry_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                await enrichTradeWithMarketData(trade.id, trade.ticker, tradeDate);

                // Generate AI review after market enrichment
                await generateAndStoreAIReview(trade.id);
              } catch (enrichmentError) {
                console.error(`Failed to enrich trade ${trade.id} with market data or AI review:`, enrichmentError);
                // Continue with other trades even if one fails
              }
            }
          }
        }

        // Show first trade as result
        const firstTrade = parsedTrades[0];
        setResult({
          ticker: firstTrade.ticker,
          entry: firstTrade.price,
          exit: null,
          size: firstTrade.size,
          time: new Date(firstTrade.timestamp).toLocaleTimeString(),
          rawData: firstTrade
        });

        // Fetch chart data for first trade
        if (firstTrade.ticker) {
          await fetchChartData(firstTrade.ticker, firstTrade.timestamp);
        }

      } else {
        // Process image file (existing screenshot flow)
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/analyze", { method: "POST", body: formData });
        const data = await res.json();
        let violations = checkRules(data);

        // Check for dangerous wins
        const realizedPl = data.realized_pl ? parseFloat(data.realized_pl) : null;
        violations = checkDangerousWin(violations, realizedPl);

        // Calculate violation cost
        const violationCost = calculateViolationCost(violations, realizedPl);

        // Calculate discipline score
        const disciplineScore = calculateDisciplineScore(violations);

        setResult({ ...data, violations });

        if (user) {
          // Insert trade with enhanced intelligence layer fields
          const { data: insertedTrade, error } = await supabase
            .from('trades')
            .insert([
              {
                ticker: data.ticker,
                entry: data.entry,
                exit: data.exit,
                size: data.size,
                time: data.time,
                violations: JSON.stringify(violations),
                realized_pl: realizedPl?.toFixed(2) || null,
                violation_cost: violationCost.toFixed(2),
                discipline_score: disciplineScore,
                user_id: user.id,
                // Initialize new intelligence layer fields
                float_shares: null,
                market_cap: null,
                sector: null,
                day_volume: null,
                avg_volume: null,
                relative_volume: null,
                ai_review: null,
                ai_replay: null,
                setup_quality: null
              },
            ])
            .select();

          if (error) {
            console.error("Error saving screenshot trade:", error);
          } else if (insertedTrade && insertedTrade.length > 0) {
            // Enrich trade with market data and generate AI review after successful insertion
            try {
              const tradeDate = data.time ? new Date(data.time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
              await enrichTradeWithMarketData(insertedTrade[0].id, data.ticker, tradeDate);

              // Generate AI review after market enrichment
              await generateAndStoreAIReview(insertedTrade[0].id);
            } catch (enrichmentError) {
              console.error(`Failed to enrich trade ${insertedTrade[0].id} with market data or AI review:`, enrichmentError);
              // Continue even if enrichment fails
            }
          }
        }

        // Fetch chart data if we have a valid ticker and time
        if (data.ticker && data.time) {
          await fetchChartData(data.ticker, data.time);
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
      setResult({ error: "Failed to process file: " + (error instanceof Error ? error.message : String(error)) });
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="text-3xl font-bold">Analyze Your Trade</h1>
          <p className="text-white/60">
            Set your rules, upload a screenshot, and get instant feedback.
          </p>
        </div>

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

        {/* UPDATED RULES CARD */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
          <CardTitle className="text-white">Your Trading Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Max Float with commas */}
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

            {/* Price Range */}
            <div>
              <label className="text-sm text-white/60">Price Range ($)</label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  value={rules.minPrice}
                  onChange={(e) =>
                    setRules({ ...rules, minPrice: Number(e.target.value) })
                  }
                  className="border-white/10 bg-white/5 text-white w-24"
                  placeholder="Min"
                />
                <span className="text-white/40">–</span>
                <Input
                  type="number"
                  value={rules.maxPrice}
                  onChange={(e) =>
                    setRules({ ...rules, maxPrice: Number(e.target.value) })
                  }
                  className="border-white/10 bg-white/5 text-white w-24"
                  placeholder="Max"
                />
              </div>
            </div>

            {/* Trade Before 9:00 AM */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rules.tradeBefore9AM}
                onChange={(e) =>
                  setRules({ ...rules, tradeBefore9AM: e.target.checked })
                }
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500"
              />
              <label className="text-sm text-white/60">
                Only allow trades before 9:00 AM
              </label>
            </div>
          </CardContent>
        </Card>

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
              {loading ? "Analyzing..." : "Analyze Trade"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Extracted Trade</CardTitle>
            </CardHeader>
            <CardContent>
              {result.error ? (
                <pre className="text-sm text-red-400">{result.error}</pre>
              ) : (
                <ul className="space-y-1 text-sm text-white/80">
                  <li>
                    <b className="text-white">Ticker:</b> {result.ticker}
                  </li>
                  <li>
                    <b className="text-white">Entry:</b> {result.entry}
                  </li>
                  <li>
                    <b className="text-white">Exit:</b> {result.exit}
                  </li>
                  <li>
                    <b className="text-white">Size:</b> {result.size}
                  </li>
                  <li>
                    <b className="text-white">Time:</b> {result.time}
                  </li>
                </ul>
              )}
              {result?.violations?.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <h4 className="mb-1 text-sm font-semibold text-red-400">
                    Violations
                  </h4>
                  <ul className="space-y-1 text-sm text-red-300">
                    {result.violations.map((v: string, i: number) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Candlestick Chart */}
        {result && !result.error && result.ticker && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Historical Price Action</CardTitle>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <div className="flex items-center justify-center h-96">
                  <div className="text-white/60">Loading chart data...</div>
                </div>
              ) : candles.length > 0 ? (
                <div className="h-96">
                  <TradeChart
                    candles={candles}
                    ticker={result.ticker}
                    width={undefined}
                    height={undefined}
                  />
                </div>
              ) : (
                <div className="text-center text-white/60 py-8">
                  No chart data available for this time period
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}