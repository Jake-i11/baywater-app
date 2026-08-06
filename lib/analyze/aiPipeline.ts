import { supabase } from "@/lib/supabase"
import type { TradeData } from "@/types/trade"

export async function fetchOrGenerateAIReview(
  tradeId: string,
  ticker: string,
  setCoachingResponse: (response: any | null) => void,
  setAiReviewLoading: (loading: boolean) => void,
  setTrades: (trades: TradeData[]) => void,
  trades: TradeData[],
  pendingReviewTrade: { current: string | null }
) {
  pendingReviewTrade.current = tradeId
  setAiReviewLoading(true)

  try {
    // Check trade state cache first
    const localTrade = trades.find(t => t.id === tradeId)
    if (localTrade?.aiReview && localTrade?.aiReviewGeneratedAt) {
      setCoachingResponse(localTrade.aiReview)
      setAiReviewLoading(false)
      return
    }

    // Try to fetch from DB
    const { data: dbTrade } = await supabase
      .from('trades')
      .select('ai_review, entry_time')
      .eq('id', tradeId)
      .single()

    if (pendingReviewTrade.current !== tradeId) return

    if (dbTrade?.ai_review) {
      try {
        const parsedReview = typeof dbTrade.ai_review === 'string'
          ? JSON.parse(dbTrade.ai_review)
          : dbTrade.ai_review
          if (parsedReview && parsedReview.grade) {
          setCoachingResponse(parsedReview)
          setTrades(trades.map(t =>
            t.id === tradeId
              ? { ...t, aiReview: parsedReview, aiReviewGeneratedAt: Date.now() }
              : t
          ))
          setAiReviewLoading(false)
          return
        }
      } catch {
        // Continue to generate
      }
    }

    // Trigger enrichment
    const enrichResponse = await fetch("/api/analyze/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId, ticker }),
    })

    if (pendingReviewTrade.current !== tradeId) return

    if (enrichResponse.ok) {
      const { data: updatedTrade } = await supabase
        .from('trades')
        .select('ai_review')
        .eq('id', tradeId)
        .single()

      if (pendingReviewTrade.current !== tradeId) return

          if (updatedTrade?.ai_review) {
            try {
              const parsedReview = typeof updatedTrade.ai_review === 'string'
                ? JSON.parse(updatedTrade.ai_review)
                : updatedTrade.ai_review
              if (parsedReview && parsedReview.grade) {
                setCoachingResponse(parsedReview)
                setTrades(trades.map(t =>
                  t.id === tradeId
                    ? { ...t, aiReview: parsedReview, aiReviewGeneratedAt: Date.now() }
                    : t
                ))
              }
            } catch {
              setCoachingResponse(null)
            }
          }
    }
  } catch (error) {
    console.error(`Error fetching/generating AI review for trade ${tradeId}:`, error)
    if (pendingReviewTrade.current === tradeId) {
      setCoachingResponse(null)
    }
  } finally {
    if (pendingReviewTrade.current === tradeId) {
      setAiReviewLoading(false)
    }
  }
}