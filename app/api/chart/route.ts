import { NextRequest, NextResponse } from "next/server";

// Explicit allowlist of supported chart timeframes (Alpaca bars API format).
// UI values like "1m" are mapped to these client-side; only these values may
// ever be passed through to Alpaca. Anything else is rejected.
const SUPPORTED_TIMEFRAMES = new Set(["1Min", "5Min", "15Min", "30Min", "1Hour"]);
const DEFAULT_TIMEFRAME = "5Min";

// Alpaca returns up to 10,000 bars per response. Long replay windows at 1Min
// granularity can exceed a single page, so follow next_page_token instead of
// silently truncating. The cap is a safety valve, not expected to be hit.
const MAX_BARS_PAGES = 50;

export async function POST(request: NextRequest) {
  try {
    const { ticker, startTime, endTime, timeframe } = await request.json();

    if (!ticker || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Missing required parameters: ticker, startTime, endTime" },
        { status: 400 }
      );
    }

    const tf = timeframe ?? DEFAULT_TIMEFRAME;
    if (typeof tf !== "string" || !SUPPORTED_TIMEFRAMES.has(tf)) {
      return NextResponse.json(
        {
          error: `Unsupported timeframe: ${String(timeframe)}. Supported timeframes: ${[...SUPPORTED_TIMEFRAMES].join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Alpaca API configuration
    const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
    const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;

    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
      return NextResponse.json(
        { error: "Alpaca API credentials not configured" },
        { status: 500 }
      );
    }

    // Convert times to ISO format for Alpaca API
    const startISO = new Date(startTime).toISOString();
    const endISO = new Date(endTime).toISOString();

    // Fetch bars from Alpaca with IEX feed (SIP feed requires higher-tier
    // subscription). Paginate through next_page_token so we never silently
    // assume a single response contains the complete dataset.
    let bars: any[] = [];
    let pageToken: string | undefined;
    let pagesFetched = 0;

    do {
      const alpacaUrl =
        `https://data.alpaca.markets/v2/stocks/${ticker}/bars` +
        `?timeframe=${tf}&start=${startISO}&end=${endISO}&limit=10000&feed=iex` +
        (pageToken ? `&page_token=${pageToken}` : "");

      // Log URL without sensitive query params (keys are in headers, not URL)
      console.log("[Chart API] Alpaca request URL:", alpacaUrl);

      const response = await fetch(alpacaUrl, {
        method: "GET",
        headers: {
          "APCA-API-KEY-ID": ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return NextResponse.json(
          {
            error: `Alpaca API error: ${response.status} ${response.statusText}`,
            details: errorData,
          },
          { status: response.status }
        );
      }

      const data = await response.json();
      if (data.bars) {
        bars.push(...data.bars);
      }
      pageToken = data.next_page_token ?? undefined;
      pagesFetched++;
    } while (pageToken && pagesFetched < MAX_BARS_PAGES);

    if (pageToken) {
      console.warn(
        `[Chart API] Alpaca data truncated for ${ticker} at ${tf} after ${MAX_BARS_PAGES} pages`
      );
    }

    // Transform Alpaca data to a format suitable for TradingView Lightweight Charts
    const candles = bars.map((bar: any) => ({
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));

    return NextResponse.json({
      ticker,
      timeframe: tf,
      candles,
      startTime: startISO,
      endTime: endISO,
    });

  } catch (error) {
    console.error("Chart API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}