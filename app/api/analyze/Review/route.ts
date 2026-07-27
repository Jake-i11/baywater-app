import { NextResponse } from "next/server";
import { generateAndStoreAIReview } from "@/lib/market-enrichment";

export async function POST(req: Request) {
  try {
    const { tradeId } = await req.json();

    await generateAndStoreAIReview(tradeId);

    return NextResponse.json({
      success: true,
    });

  } catch (error) {
    console.error("AI review API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate AI review",
      },
      {
        status: 500,
      }
    );
  }
}