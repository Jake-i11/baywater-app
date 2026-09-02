import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterClient } from "@/lib/ai/client";
import { AI_MODELS } from "@/lib/ai/models";
import { extractTradeJson, resolveTradePrices } from "@/lib/analyze/parseTradeJson";

export async function POST(request: NextRequest) {
  console.log("[ANALYZE API] request received");
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("[ANALYZE API] no file in form data");
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    console.log("[ANALYZE API] image received:", file.name, file.type, file.size, "bytes");

    // Convert file to base64 for OpenRouter
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");
    const mimeType = file.type || "image/png";

    // Use OpenRouter client
    const client = getOpenRouterClient();

    console.log("[ANALYZE API] calling OpenRouter with model:", AI_MODELS.vision);

    const prompt = `Analyze this trading screenshot and extract the following information:

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

CRITICAL PRICING RULE — read this before extracting entry and exit:

Broker order screens usually show BOTH the order's requested limit price AND the price the order actually filled at. These are often different.
- "Limit Price" is the price the TRADER REQUESTED on the order, NOT necessarily the price they actually received.
- For an executed trade, entry/exit MUST be the ACTUAL FILLED/EXECUTED price, never the limit price.

When the screenshot shows more than one price for the same side (entry or exit), choose the price using this EXACT priority:
  1. "Average Fill Price" / "Avg Fill Price" / "Average Price" / "Avg Price"
  2. "Fill Price" / "Filled Price" / "Average Fill Price" variants
  3. "Execution Price" / "Executed Price"
  4. Any other price the broker shows as the actual filled/executed price (e.g., a "Price" column next to a "Filled" quantity, or "Avg Price" in the position summary)
  5. ONLY if none of the above are visible anywhere in the screenshot: "Limit Price"

NEVER prefer Limit Price over an available Average Fill Price, Average Price, Fill Price, Filled Price, Execution Price, or Executed Price. If a limit price AND an average/fill price are both visible, ALWAYS use the average/fill price.

Apply this same rule independently to BOTH the entry side and the exit side of the trade.

Additionally, so the pipeline can double-check the pricing rule, return these raw helper fields (each null if not visible):
- entry_fill: the actual filled/executed price for the entry side (e.g., "1.47"), chosen by the priority above
- entry_limit: the Limit Price for the entry side (e.g., "1.50")
- exit_fill: the actual filled/executed price for the exit side, chosen by the priority above
- exit_limit: the Limit Price for the exit side

Return ONLY valid JSON. If any value is not visible in the screenshot, return null for that field.`;

    // Generate content with image and text prompt using OpenRouter
    async function callOpenRouter(): Promise<{ content: string | null; status?: number }> {
      try {
        const response = await client.chat.completions.create({
          model: AI_MODELS.vision,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
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
          max_tokens: 1500
        });
        return { content: response.choices[0]?.message?.content ?? null };
      } catch (err: any) {
        // Surface the HTTP status + message from the SDK so failures are visible
        console.error("[ANALYZE API] OpenRouter request failed:", {
          status: err?.status ?? "unknown",
          message: err?.message ?? String(err),
        });
        return { content: null, status: err?.status ?? undefined };
      }
    }

    // Call OpenRouter; retry up to MAX_ATTEMPTS total. The free vision model
    // occasionally returns a non-JSON safety/refusal string for an otherwise
    // valid screenshot, so a couple of retries dramatically improve success.
    const MAX_ATTEMPTS = 3;
    let result = await callOpenRouter();
    console.log("[ANALYZE API] OpenRouter response received", result.status ? `(http ${result.status})` : "");
    console.log("[ANALYZE API] raw content type/length:", typeof result.content, result.content?.length ?? 0);
    console.log("[ANALYZE API] raw content preview:", (result.content ?? "").slice(0, 300));

    let parse = extractTradeJson(result.content);
    for (let attempt = 2; !parse.ok && attempt <= MAX_ATTEMPTS; attempt++) {
      console.warn(`[ANALYZE API] attempt ${attempt - 1} parse failed:`, parse.reason, `— retrying (${attempt}/${MAX_ATTEMPTS})`);
      await new Promise((r) => setTimeout(r, 400)); // brief backoff before retry
      result = await callOpenRouter();
      console.log(`[ANALYZE API] retry ${attempt} raw content preview:`, (result.content ?? "").slice(0, 300));
      parse = extractTradeJson(result.content);
    }

    if (!parse.ok || !parse.trade) {
      console.error("[ANALYZE API] Failed to parse trade data from OpenRouter response:", parse.reason);
      return NextResponse.json({ error: "Could not parse trade data from OpenRouter response" }, { status: 422 });
    }

    const trade = parse.trade;

    // ── Post-processing: enforce fill-price-over-limit-price priority ──
    // The prompt already instructs the model, but we also enforce it in code so
    // a model misread of a Limit Price can never override an actual fill price.
    const entryBefore = trade.entry;
    const exitBefore = trade.exit;
    resolveTradePrices(trade);
    console.log("[ANALYZE API] entry price:", entryBefore, "→", trade.entry);
    console.log("[ANALYZE API] exit price:", exitBefore, "→", trade.exit);

    // Validate required fields (timezone is no longer required — it's inferred as America/New_York)
    if (!trade?.ticker || !trade?.entry || !trade?.exit || !trade?.size) {
      console.error("[ANALYZE API] Missing required trade data:", trade);
      return NextResponse.json({ error: "Missing required trade data (ticker, entry, exit, size)" }, { status: 422 });
    }

    // Strip internal helper fields so the response contract stays unchanged
    const { entry_fill, entry_limit, entry_fill_price, entry_limit_price, exit_fill, exit_limit, exit_fill_price, exit_limit_price, ...cleanTrade } = trade;
    console.log("[ANALYZE API] parsed trade:", cleanTrade);
    return NextResponse.json(cleanTrade);
  } catch (error) {
    console.error("[ANALYZE API] Analysis error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}