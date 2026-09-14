"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AIReplay } from '@/components/AIReplay';
import { ReplayTimeline } from '@/components/ReplayTimeline';
import { AIReplayChart } from '@/components/AIReplayChart';
import { formatPL } from '@/lib/utils';

interface Trade {
  id: string;
  ticker: string | null;
  side: string | null;
  size: string | null;
  realized_pl: number | null;
  entry_price: number | null;
  exit_price: number | null;
  discipline_score: number | null;
  setup_type: string | null;
  entry_time: string | null;
  exit_time: string | null;
  created_at: string;
  violations: string[];
  violation_count: number;
  chart_data: any | null;
  ai_replay: string | null;
  decision_quality: any | null;
  ai_review: {
    summary: string | null;
    trade_grade: string | null;
    strengths: string[];
    mistakes: string[];
    lesson: string | null;
  } | null;
  float_shares: number | null;
  market_cap: number | null;
  relative_volume: number | null;
  sector: string | null;
}

interface ReplayEvent {
  timestamp: string;
  title: string;
  description: string;
}

interface ReplayAnalysis {
  replay_events: ReplayEvent[];
  setup_type: string;
  setup_confidence: number;
  decision_quality: {
    entry_score: number;
    exit_score: number;
    risk_score: number;
    overall_grade: string;
  };
  decision_vs_outcome: string;
  mistakes: string[];
  strengths: string[];
  lesson: string;
}

interface Props {
  params: Promise<{ membershipId: string; tradeId: string }>;
}

export default function CoachStudentTradeReplayPage({ params }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams.get('orgId') ?? '';

  const [membershipId, setMembershipId] = useState<string>('');
  const [tradeId, setTradeId] = useState<string>('');
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [replayAnalysis, setReplayAnalysis] = useState<ReplayAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const loadData = useCallback(async () => {
    const { membershipId: memId, tradeId: trId } = await params;
    setMembershipId(memId);
    setTradeId(trId);

    if (!orgId) {
      setError('Missing organization');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(
        `/api/analytics/coach/student/trade/${trId}?orgId=${orgId}&membershipId=${memId}`,
        { cache: 'no-store' }
      );

      if (res.status === 404) {
        setError('Trade not found');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError('Failed to load trade');
        setLoading(false);
        return;
      }

      const data = await res.json() as {
        trade: Trade;
      };
      setTrade(data.trade);

      // Fetch chart data if we have ticker and times
      if (data.trade.ticker && (data.trade.entry_time || data.trade.exit_time)) {
        await fetchChartData(data.trade.ticker, data.trade.entry_time || '', data.trade.exit_time || '');
      }

      // Check if we already have replay analysis in decision_quality
      if (data.trade.decision_quality && data.trade.decision_quality.replay_events) {
        try {
          setReplayAnalysis({
            replay_events: data.trade.decision_quality.replay_events,
            setup_type: data.trade.decision_quality.setup_type || 'Unclassified',
            setup_confidence: data.trade.decision_quality.setup_confidence || 0,
            decision_quality: data.trade.decision_quality.decision_quality || {
              entry_score: 0,
              exit_score: 0,
              risk_score: 0,
              overall_grade: 'N/A',
            },
            decision_vs_outcome: data.trade.decision_quality.decision_vs_outcome || 'N/A',
            mistakes: data.trade.decision_quality.mistakes || [],
            strengths: data.trade.decision_quality.strengths || [],
            lesson: data.trade.decision_quality.lesson || 'N/A',
          });
        } catch {
          // Generate new analysis if parsing fails
          await generateReplayAnalysis(data.trade);
        }
      } else {
        await generateReplayAnalysis(data.trade);
      }
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [params, orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function fetchChartData(ticker: string, entryTime: string, exitTime: string) {
    try {
      setChartLoading(true);

      const tradeTime = new Date(entryTime);
      if (isNaN(tradeTime.getTime())) {
        setChartLoading(false);
        return;
      }

      const startTime = new Date(tradeTime);
      startTime.setMinutes(tradeTime.getMinutes() - 30);

      const endTime = exitTime ? new Date(exitTime) : new Date(tradeTime.getTime() + 2 * 60 * 60 * 1000);

      const response = await fetch('/api/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      });

      if (response.ok) {
        const chartData = await response.json();
        if (chartData.candles && chartData.candles.length > 0) {
          setCandles(chartData.candles);
        }
      }
    } catch {
      console.error('Chart fetch error');
    } finally {
      setChartLoading(false);
    }
  }

  async function generateReplayAnalysis(tradeData: Trade) {
    try {
      setAnalysisLoading(true);

      const response = await fetch(`/api/replay-analysis?tradeId=${tradeData.id}`);
      if (response.ok) {
        const analysis = await response.json() as ReplayAnalysis;
        setReplayAnalysis(analysis);
      }
    } catch {
      console.error('Replay analysis error');
    } finally {
      setAnalysisLoading(false);
    }
  }

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentEventIndex(0);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-canvas">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading trade replay...</p>
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="flex items-center justify-center h-full bg-canvas">
        <div className="text-center">
          <p className="text-loss-red mb-2">{error ?? 'Trade not found'}</p>
          <Link href={`/analytics/coach/student/${membershipId}/trades?orgId=${orgId}`} className="text-accent hover:underline">
            ← Back to Trades
          </Link>
        </div>
      </div>
    );
  }

  const entryPrice = trade.entry_price ?? undefined;
  const exitPrice = trade.exit_price ?? undefined;

  return (
    <div className="flex flex-col gap-6 min-h-screen bg-canvas">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/analytics/coach/student/${membershipId}/trades?orgId=${orgId}`}
            className="text-sm text-accent hover:underline flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            ← Back to Trades
          </Link>
          <h1 className="text-xl font-bold text-text-primary">
            {trade.ticker} — Trade Replay
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Level 3 — Full replay data loaded on demand
          </p>
        </div>
      </div>

      {/* Trade Summary */}
      <Card className="border border-card-border bg-card-bg">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="text-lg font-bold text-text-primary">{trade.ticker}</div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                trade.side?.toUpperCase() === 'SHORT'
                  ? 'bg-loss-tint text-loss-red'
                  : 'bg-profit-tint text-profit-green'
              }`}>
                {trade.side?.toUpperCase()}
              </span>
            </div>
            <div className={`text-lg font-bold tabular-nums ${
              trade.realized_pl != null && trade.realized_pl > 0 ? 'text-profit-green' : 'text-loss-red'
            }`}>
              {formatPL(trade.realized_pl != null ? String(trade.realized_pl) : '—')}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-text-muted">Entry</div>
              <div className="font-medium text-text-primary">
                {entryPrice != null ? `$${entryPrice.toFixed(2)}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Exit</div>
              <div className="font-medium text-text-primary">
                {exitPrice != null ? `$${exitPrice.toFixed(2)}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Size</div>
              <div className="font-medium text-text-primary">{trade.size ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Date</div>
              <div className="font-medium text-text-primary">
                {trade.entry_time ? new Date(trade.entry_time).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          {(trade.float_shares != null || trade.market_cap != null || trade.relative_volume != null) && (
            <div className="grid grid-cols-3 gap-3 mt-3 text-xs text-text-muted">
              <div>
                {trade.float_shares != null ? `Float: ${(trade.float_shares / 1_000_000).toFixed(1)}M` : 'Float: N/A'}
              </div>
              <div>
                {trade.market_cap != null ? `Mkt Cap: $${(trade.market_cap / 1_000_000_000).toFixed(1)}B` : 'Mkt Cap: N/A'}
              </div>
              <div>
                {trade.relative_volume != null ? `RV: ${trade.relative_volume.toFixed(1)}x` : 'RV: N/A'}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Replay Chart */}
      <Card className="border border-card-border bg-card-bg">
        <CardHeader>
          <CardTitle>Interactive Trade Replay</CardTitle>
        </CardHeader>
        <CardContent className="h-[400px]">
          {chartLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-muted">Loading chart data...</p>
            </div>
          ) : candles.length > 0 ? (
            <AIReplayChart
              candles={candles}
              ticker={trade.ticker || ''}
              entryPrice={entryPrice}
              exitPrice={exitPrice}
              entryTime={trade.entry_time ?? undefined}
              exitTime={trade.exit_time ?? undefined}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              currentEventIndex={currentEventIndex}
              onEventChange={setCurrentEventIndex}
              replayEvents={replayAnalysis?.replay_events || []}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-muted">No chart data available for this trade</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Playback Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-card-border hover:bg-neutral-fill transition-colors"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-card-border hover:bg-neutral-fill transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <div className="flex items-center gap-2 ml-4">
          <span className="text-xs text-text-muted">Speed:</span>
          {[0.5, 1, 2].map(speed => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className={`px-2 py-1 text-xs rounded ${
                playbackSpeed === speed
                  ? 'bg-accent text-white'
                  : 'border border-card-border text-text-muted hover:text-text-primary'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      {/* AI Replay Timeline */}
      {replayAnalysis && replayAnalysis.replay_events && replayAnalysis.replay_events.length > 0 && (
        <Card className="border border-card-border bg-card-bg">
          <CardHeader>
            <CardTitle>AI Commentary Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ReplayTimeline
              events={replayAnalysis.replay_events}
              currentEventIndex={currentEventIndex}
              onEventClick={setCurrentEventIndex}
            />
          </CardContent>
        </Card>
      )}

      {/* AI Replay Text */}
      {trade.ai_replay && (
        <Card className="border border-card-border bg-card-bg">
          <CardHeader>
            <CardTitle>AI Trade Replay</CardTitle>
          </CardHeader>
          <CardContent>
            <AIReplay replayText={trade.ai_replay || ''} entryTime={trade.entry_time || ''} exitTime={trade.exit_time || ''} />
          </CardContent>
        </Card>
      )}

      {/* Decision Quality */}
      {replayAnalysis && (
        <Card className="border border-card-border bg-card-bg">
          <CardHeader>
            <CardTitle>Decision Quality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 rounded-full bg-accent-tint text-accent text-sm">
                {replayAnalysis.setup_type || 'Unclassified'}
              </span>
              <span className="text-sm text-text-muted">
                Confidence: {replayAnalysis.setup_confidence}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-text-muted">Entry Score</div>
                <div className="text-xl font-bold text-text-primary">{replayAnalysis.decision_quality.entry_score}/100</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Exit Score</div>
                <div className="text-xl font-bold text-text-primary">{replayAnalysis.decision_quality.exit_score}/100</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Risk Score</div>
                <div className="text-xl font-bold text-text-primary">{replayAnalysis.decision_quality.risk_score}/100</div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs text-text-muted">Overall Grade</div>
              <div className="text-3xl font-bold text-accent">{replayAnalysis.decision_quality.overall_grade}</div>
            </div>

            <div>
              <div className="text-xs text-text-muted mb-1">Decision vs Outcome</div>
              <p className="text-sm text-text-primary">{replayAnalysis.decision_vs_outcome}</p>
            </div>

            {replayAnalysis.strengths.length > 0 && (
              <div>
                <div className="text-xs text-text-muted mb-1">Strengths</div>
                <div className="space-y-1">
                  {replayAnalysis.strengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-profit-green mt-0.5">+</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {replayAnalysis.mistakes.length > 0 && (
              <div>
                <div className="text-xs text-text-muted mb-1">Mistakes</div>
                <div className="space-y-1">
                  {replayAnalysis.mistakes.map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-loss-red mt-0.5">−</span>
                      <span>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs text-text-muted mb-1">Lesson</div>
              <p className="text-sm text-text-primary">{replayAnalysis.lesson}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
