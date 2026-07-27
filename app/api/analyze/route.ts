import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterClient } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Convert file to base64 for OpenRouter
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const mimeType = file.type || "image/png";

    // Use OpenRouter client
    const client = getOpenRouterClient();

    // Generate content with image and text prompt using OpenRouter
    const response = await client.chat.completions.create({
      model: AI_MODELS.vision,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this trading screenshot and extract the following information:

- ticker: The stock symbol (e.g., "AAPL", "TSLA")
- entry: The entry price as a string (e.g., "1.59")
- exit: The exit price as a string (e.g., "1.46")
- size: The position size as a string (e.g., "68")
- time: The complete entry/opening trade timestamp as visible in the screenshot. Extract the FULL date, time, and timezone together.
  Accepted formats: "7/01/26 13:42:47 EDT", "07/01/2026 13:42:47 EDT", "2026-07-01 13:42:47", "2026-07-01 01:42 PM", etc.
  If only a date and time are visible without a timezone name, still return them as the time value.
  If no timestamp is visible at all, return null.
- exit_time: The complete exit/closing/cover trade timestamp as visible in the screenshot.
  Look for column headers or labels such as: "Exit Time", "Close Time", "Filled Time", "Closing Time", "Cover Time", "Sell Time", "Order Filled Time".
  Accepted formats: "7/01/26 14:18:32 EDT", "07/01/2026 14:18:32 EDT", "2026-07-01 14:18:32", "2026-07-01 02:18 PM", etc.
  If no exit timestamp is visible, return null.

Return ONLY valid JSON. If any value is not visible in the screenshot, return null for that field.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
      max_tokens: 1000
    });

    // Get the JSON response
    const tradeData = response.choices[0].message.content;

    // Parse and validate the JSON
    let trade;
    try {
      const cleaned = tradeData?.trim().replace(/^```json\s*|\s*```$/g, "");
      if (cleaned) {
        trade = JSON.parse(cleaned);
      } else {
        throw new Error("Empty response");
      }
    } catch (parseError) {
      console.error("Failed to parse OpenRouter response:", tradeData);
      return NextResponse.json({ error: "Could not parse trade data" }, { status: 422 });
    }

    // Validate required fields (timezone is no longer required — it's inferred as America/New_York)
    if (!trade?.ticker || !trade?.entry || !trade?.exit || !trade?.size) {
      return NextResponse.json({ error: "Missing required trade data" }, { status: 422 });
    }

    return NextResponse.json(trade);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}