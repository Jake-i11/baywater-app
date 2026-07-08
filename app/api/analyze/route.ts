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
- entry: The entry price as a string
- exit: The exit price as a string
- size: The position size as a string
- tradeDate: The date of the trade if visible (YYYY-MM-DD format), or null if not visible
- tradeTime: The time of the trade if visible (e.g., "9:30 AM"), or null if not visible
- timezone: The timezone if visible, otherwise use "UTC"

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

    // Validate required fields
    if (!trade?.ticker || !trade?.entry || !trade?.exit || !trade?.size || !trade?.timezone) {
      return NextResponse.json({ error: "Missing required trade data" }, { status: 422 });
    }

    return NextResponse.json(trade);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}