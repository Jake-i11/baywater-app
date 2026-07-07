import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    // Convert file to base64 for Gemini
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const mimeType = file.type || "image/png";

    // Initialize Gemini client
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    // Generate content with image and text prompt
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType
        }
      },
      {
        text: `Analyze this trading screenshot and extract the following information:

- ticker: The stock symbol (e.g., "AAPL", "TSLA")
- entry: The entry price as a string
- exit: The exit price as a string
- size: The position size as a string
- tradeDate: The date of the trade if visible (YYYY-MM-DD format), or null if not visible
- tradeTime: The time of the trade if visible (e.g., "9:30 AM"), or null if not visible
- timezone: The timezone if visible, otherwise use "UTC"

Return ONLY valid JSON. If any value is not visible in the screenshot, return null for that field.`
      }
    ]);

    // Get the JSON response
    const response = await result.response;
    const tradeData = response.text();

    // Parse and validate the JSON
    let trade;
    try {
      trade = JSON.parse(tradeData);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
      return NextResponse.json({ error: "Could not parse trade data" }, { status: 422 });
    }

    // Validate required fields
    if (!trade.ticker || !trade.entry || !trade.exit || !trade.size || !trade.timezone) {
      return NextResponse.json({ error: "Missing required trade data" }, { status: 422 });
    }

    return NextResponse.json(trade);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
