import { NextResponse } from "next/server";
import { enrichTradeWithMarketData, generateAndStoreCoachingReview } from "@/lib/market-enrichment";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tradeId, ticker, tradeDate, traderContext } = body;

    if (!tradeId || !ticker || !tradeDate) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters: tradeId, ticker, tradeDate" },
        { status: 400 }
      );
    }

    // Enrich trade with market data (still useful for future analysis)
    await enrichTradeWithMarketData(tradeId, ticker, tradeDate);

    // Generate AI coaching review with trader context (if provided)
    await generateAndStoreCoachingReview(tradeId, traderContext);

    return NextResponse.json({
      success: true,
      message: "Trade enriched and AI coaching review generated successfully"
    });

  } catch (error) {
    console.error("Enrichment API error:", error);

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('Finnhub API key not configured')) {
        return NextResponse.json(
          {
            success: false,
            error: "Market data enrichment failed: Finnhub API key not configured",
            details: "The server is missing the FINNHUB_API_KEY environment variable"
          },
          { status: 500 }
        );
      }

      if (error.message.includes('OpenRouter API key not configured')) {
        return NextResponse.json(
          {
            success: false,
            error: "AI review generation failed: OpenRouter API key not configured",
            details: "The server is missing the OPENROUTER_API_KEY environment variable"
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to enrich trade and generate AI review",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}