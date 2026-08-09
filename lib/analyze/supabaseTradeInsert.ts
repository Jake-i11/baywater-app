import { supabase } from "@/lib/supabase"
import type { TradeData } from "@/types/trade"

export function normalizeFieldValue(value: any, fieldType: 'integer' | 'numeric' | 'string' | 'json'): any {
  if (value === null || value === undefined) {
    return null;
  }

  switch (fieldType) {
    case 'integer':
      // Handle string values that should be integers
      if (typeof value === 'string') {
        if (value.trim() === '' || value.trim().toLowerCase() === 'null' || value.trim().toLowerCase() === 'n/a') {
          return null;
        }
        const num = Number(value);
        return isNaN(num) ? null : Math.round(num);
      }
      // Handle boolean values
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      // Handle numeric values
      if (typeof value === 'number') {
        return Math.round(value);
      }
      // Handle invalid types
      return null;

    case 'numeric':
      // Handle string values that should be numeric
      if (typeof value === 'string') {
        if (value.trim() === '' || value.trim().toLowerCase() === 'null' || value.trim().toLowerCase() === 'n/a') {
          return null;
        }
        const num = Number(value);
        return isNaN(num) ? null : num;
      }
      // Handle boolean values
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      // Handle numeric values
      if (typeof value === 'number') {
        return value;
      }
      // Handle invalid types
      return null;

    case 'string':
      // Convert non-string values to strings, but handle null/undefined
      if (value === null || value === undefined) {
        return null;
      }
      return String(value);

    case 'json':
      // Handle JSON serialization
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      if (typeof value === 'string') {
        try {
          // If it's already a JSON string, parse and re-stringify to validate
          JSON.parse(value);
          return value;
        } catch {
          // If not valid JSON, return as-is or null?
          return value;
        }
      }
      return value;

    default:
      return value;
  }
}

export async function fetchAndSaveChartData(trade: TradeData, tradeIndex: number, tradesLength: number) {
  try {
    console.log(`[CHART] Fetching chart for ${trade.ticker} (trade ${tradeIndex + 1}/${tradesLength}`);
    console.log(`[CHART] Entry: ${trade.entry_time}`);
    console.log(`[CHART] Exit: ${trade.exit_time}`);

    if (!trade.entry_time || !trade.id) {
      console.warn(`[CHART] Skipping chart fetch for trade ${trade.id} - missing entry time or trade ID`);
      return;
    }

    // Calculate end time (exit time or 2 hours after entry)
    const exitTime = trade.exit_time || new Date(new Date(trade.entry_time).getTime() + 2 * 60 * 60 * 1000).toISOString();
    console.log(`[CHART] Alpaca request - Start: ${trade.entry_time}, End: ${exitTime}`);

    const response = await fetch("/api/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: trade.ticker,
        startTime: trade.entry_time,
        endTime: exitTime,
      }),
    });

   if (!response.ok) {
  const contentType = response.headers.get("content-type");
  const rawBody = await response.text();

  let errorData: unknown = rawBody;

  if (contentType?.includes("application/json")) {
    try {
      errorData = JSON.parse(rawBody);
    } catch {
      errorData = rawBody;
    }
  }

  console.error(`[CHART] Failed to fetch chart for ${trade.ticker}:`, {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    contentType,
    body: errorData,
  });

  return;
}

    const chartData = await response.json();
    const candlesCount = chartData.candles?.length || 0;
    console.log(`[CHART] Candles returned: ${candlesCount}`);

    if (candlesCount > 0) {
      // Update Supabase with chart data
      console.log(`[DB UPDATE] Updating chart_data for trade: ${trade.id}`);
      const { error: updateError } = await supabase
        .from('trades')
        .update({
          chart_data: chartData
        })
        .eq('id', trade.id);

      if (updateError) {
        console.error(`[DB UPDATE] Failed to save chart_data for trade ${trade.id}:`, updateError);
      } else {
        console.log(`[DB UPDATE] chart_data saved for trade: ${trade.id}`);
      }
    } else {
      console.warn(`[CHART] No candles returned for ${trade.ticker}`);
    }

  } catch (error) {
    console.error(`[CHART] Error fetching chart data for ${trade.ticker}:`, error);
  }
}

export async function triggerAIReviewGeneration(trade: TradeData) {
  try {
    if (!trade.id || !trade.entry_time) {
      console.warn(`[AI] Skipping AI review for trade ${trade.id} - missing trade ID or entry time`);
      return;
    }

    console.log(`[AI] Starting review generation for trade: ${trade.id}`);

    const response = await fetch("/api/analyze/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tradeId: trade.id,
        ticker: trade.ticker,
        tradeDate: trade.entry_time
      }),
    });

   if (!response.ok) {
  const contentType = response.headers.get("content-type");
  const rawBody = await response.text();

  let errorData: unknown = rawBody;

  if (contentType?.includes("application/json")) {
    try {
      errorData = JSON.parse(rawBody);
    } catch {
      errorData = rawBody;
    }
  }

  console.error(`[AI] Failed to generate AI review for trade ${trade.id}:`, {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    contentType,
    body: errorData,
  });
} else {
      console.log(`[AI] Review generation completed for trade: ${trade.id}`);
    }

  } catch (error) {
    console.error(`[AI] Error generating AI review for trade ${trade.id}:`, error);
  }
}

export async function saveTradesToSupabase(trades: TradeData[], userId: string, setTrades: (trades: TradeData[]) => void, setShowFailureMessage: (message: string | null) => void) {
  try {
    // Prepare trades for Supabase insert - only include valid database columns
    const tradesToInsert = trades.map(trade => {
      // Build payload with only valid database columns
      const payload: any = {
        ticker: trade.ticker,
        direction: trade.direction,
        entry_price: trade.entry_price ? parseFloat(trade.entry_price) : null,
        exit_price: trade.exit_price ? parseFloat(trade.exit_price) : null,
        size: trade.size,
        entry_time: trade.entry_time,
        exit_time: trade.exit_time,
        realized_pl: trade.realized_pl ? parseFloat(trade.realized_pl) : null,
        hold_time: trade.holdTime,
        violations: JSON.stringify(trade.violations),
        discipline_score: trade.discipline_score,
        violation_cost: trade.violation_cost ? parseFloat(trade.violation_cost) : null,
        user_id: userId,
        created_at: new Date().toISOString()
      }

      // Add optional fields if they exist in the trade data
      if (trade.rawData) {
        if (trade.rawData.order_date) payload.order_date = trade.rawData.order_date;
        if (trade.rawData.transaction_date) payload.transaction_date = trade.rawData.transaction_date;
        if (trade.rawData.source) payload.source = trade.rawData.source;
        if (trade.rawData.float) payload.float = normalizeFieldValue(trade.rawData.float, 'numeric');
        if (trade.rawData.chart_data) payload.chart_data = normalizeFieldValue(trade.rawData.chart_data, 'json');
        if (trade.rawData.float_shares) payload.float_shares = normalizeFieldValue(trade.rawData.float_shares, 'numeric');
        if (trade.rawData.market_cap) payload.market_cap = normalizeFieldValue(trade.rawData.market_cap, 'numeric');
        if (trade.rawData.avg_volume) payload.avg_volume = normalizeFieldValue(trade.rawData.avg_volume, 'numeric');
        if (trade.rawData.day_volume) payload.day_volume = normalizeFieldValue(trade.rawData.day_volume, 'numeric');
        if (trade.rawData.relative_volume) payload.relative_volume = normalizeFieldValue(trade.rawData.relative_volume, 'numeric');
        if (trade.rawData.sector) payload.sector = trade.rawData.sector;
        if (trade.aiReview) payload.ai_review = normalizeFieldValue(trade.aiReview, 'json');
        if (trade.rawData.ai_replay) payload.ai_replay = trade.rawData.ai_replay;
        if (trade.rawData.setup_quality) payload.setup_quality = normalizeFieldValue(trade.rawData.setup_quality, 'integer');
        if (trade.rawData.trade_grade) payload.trade_grade = trade.rawData.trade_grade;
        if (trade.rawData.setup_type) payload.setup_type = trade.rawData.setup_type;
        if (trade.rawData.setup_confidence) payload.setup_confidence = normalizeFieldValue(trade.rawData.setup_confidence, 'integer');
        if (trade.rawData.decision_quality) payload.decision_quality = normalizeFieldValue(trade.rawData.decision_quality, 'json');
      }

      return payload;
    })

    // Add debug log as requested
    console.log("[DB INSERT] Final payload:", JSON.stringify(tradesToInsert[0], null, 2))

    // Validate integer fields specifically mentioned in requirements
    tradesToInsert.forEach((payload, index) => {
      const integerFields = ['discipline_score', 'setup_quality', 'setup_confidence', 'hold_time'];
      integerFields.forEach(field => {
        if (payload[field] !== null && payload[field] !== undefined) {
          if (typeof payload[field] !== 'number' || !Number.isInteger(payload[field])) {
            console.warn(`[DB VALIDATION] Trade ${index}: ${field} is not a valid integer:`, payload[field]);
            payload[field] = null;
          }
        }
      });
    });

   // Insert trades into Supabase
   const { data, error } = await supabase
     .from('trades')
     .insert(tradesToInsert)
     .select()

   if (error) {
     console.error('[DB INSERT] Error message:', error.message)
     console.error('[DB INSERT] Error code:', error.code)
     console.error('[DB INSERT] Error details:', error.details)
     console.error('[DB INSERT] Error hint:', error.hint)
     throw error
   }

   console.log('[DB INSERT] Returned data:', data)

     // Update local trades with database IDs
   if (data && data.length > 0) {
     const updatedTrades = trades.map((trade: TradeData, index: number) => {
       if (data[index]) {
         return {
           ...trade,
           id: data[index].id
         }
       }
       return trade
     })

     setTrades(updatedTrades)

     // [PIPELINE] Post-insert processing: Fetch chart data and generate AI reviews
     console.log("[PIPELINE] Starting post-insert processing for", data.length, "trades");

     // Process trades sequentially to avoid overwhelming APIs
     for (let i = 0; i < data.length; i++) {
       const tradeWithId = updatedTrades[i];

       if (tradeWithId?.id) {
         // Fetch chart data for this trade
         await fetchAndSaveChartData(tradeWithId, i, data.length);

         // Trigger AI review generation
         await triggerAIReviewGeneration(tradeWithId);
       }
     }

     console.log("[PIPELINE] Post-insert processing completed");
   }

   return data
 } catch (error) {
   console.error('[DB INSERT] Failed to save trades:', error)
   setShowFailureMessage("Failed to save trades to database. Please check console for details.")
   throw error
 }
}