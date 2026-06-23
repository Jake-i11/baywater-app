import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const mediaType = file.type || "image/png";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: "text",
                text: `Extract the following trade information from this screenshot:
- ticker (stock symbol)
- entry price (as a number)
- exit price (as a number)
- size (position size, as a number)
- time (time of trade, e.g., "9:30 AM")

Return ONLY a valid JSON object with these fields. If something is missing, use null.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "";

    let trade = null;
    try {
      trade = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Could not parse trade data" }, { status: 422 });
    }

    return NextResponse.json(trade);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}