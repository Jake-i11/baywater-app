import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { ticker, startTime, endTime } = await request.json();

    if (!ticker || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Missing required parameters: ticker, startTime, endTime" },
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

    // Fetch 5-minute bars from Alpaca
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/bars?timeframe=5Min&start=${startISO}&end=${endISO}&limit=1000`,
      {
        method: "GET",
        headers: {
          "APCA-API-KEY-ID": ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
        },
      }
    );

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

    // Transform Alpaca data to a format suitable for TradingView Lightweight Charts
    const candles = data.bars?.map((bar: any) => ({
      time: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    })) || [];

    return NextResponse.json({
      ticker,
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