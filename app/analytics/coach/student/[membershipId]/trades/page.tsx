"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Clock, ArrowRight, Briefcase } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
}

interface Props {
  params: Promise<{ membershipId: string }>;
}

export default function CoachStudentTradesPage({ params }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams.get('orgId') ?? '';

  const [membershipId, setMembershipId] = useState<string>('');
  const [pseudonym, setPseudonym] = useState<string>('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { membershipId: id } = await params;
    setMembershipId(id);

    if (!orgId) {
      setError('Missing organization');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(
        `/api/analytics/coach/student/trades?orgId=${orgId}&membershipId=${id}`,
        { cache: 'no-store' }
      );

      if (res.status === 404) {
        setError('Student not found');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError('Failed to load trades');
        setLoading(false);
        return;
      }

      const data = await res.json() as {
        pseudonym: string;
        trades: Trade[];
        tradeCount: number;
      };
      setPseudonym(data.pseudonym);
      setTrades(data.trades);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [params, orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-muted">Loading trades...</p>
        </div>
      </div>
    );
  }

  if (error || !pseudonym) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-loss-red mb-2">{error ?? 'Not found'}</p>
          <Link href={`/analytics/coach?orgId=${orgId}`} className="text-accent hover:underline">
            ← Back to Firm Analytics
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/analytics/coach/student/${membershipId}?orgId=${orgId}`}
            className="text-sm text-accent hover:underline flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            ← Back to Analytics
          </Link>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            {pseudonym} — Trades
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {trades.length} trades · Click a trade to view replay
          </p>
        </div>
      </div>

      {/* Trade List */}
      {trades.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-card-border">
          <table className="w-full text-sm">
            <thead className="bg-neutral-fill text-text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Ticker</th>
                <th className="px-4 py-3 font-medium">Direction</th>
                <th className="px-4 py-3 font-medium">Entry Time</th>
                <th className="px-4 py-3 font-medium">P&L</th>
                <th className="px-4 py-3 font-medium">Entry</th>
                <th className="px-4 py-3 font-medium">Exit</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Discipline</th>
                <th className="px-4 py-3 font-medium">Setup</th>
                <th className="px-4 py-3 font-medium">Violations</th>
                <th className="px-4 py-3 font-medium">Replay</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => {
                const isProfitable = t.realized_pl != null && t.realized_pl > 0;
                const entryTime = t.entry_time ? new Date(t.entry_time).toLocaleString() : '—';
                const holdTime = t.entry_time && t.exit_time
                  ? `${Math.round((new Date(t.exit_time).getTime() - new Date(t.entry_time).getTime()) / 60000)}m`
                  : '—';

                return (
                  <tr key={t.id} className="border-t border-card-border align-top hover:bg-neutral-fill/30">
                    <td className="px-4 py-3 font-medium text-text-primary">{t.ticker ?? '—'}</td>
                    <td className="px-4 py-3">
                      {t.side ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.side.toUpperCase() === 'SHORT'
                            ? 'bg-loss-tint text-loss-red'
                            : 'bg-profit-tint text-profit-green'
                        }`}>
                          {t.side.toUpperCase()}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-muted whitespace-nowrap text-xs">{entryTime}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={isProfitable ? 'text-profit-green' : 'text-loss-red'}>
                        {formatPL(t.realized_pl != null ? String(t.realized_pl) : '—')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {t.entry_price != null ? `$${t.entry_price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {t.exit_price != null ? `$${t.exit_price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-muted text-xs">{t.size ?? '—'}</td>
                    <td className="px-4 py-3 text-text-muted text-xs">
                      {t.discipline_score != null ? `${t.discipline_score}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">{t.setup_type ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      {t.violation_count > 0 ? (
                        <span className="text-loss-red">{t.violation_count}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analytics/coach/student/${membershipId}/trade/${t.id}?orgId=${orgId}`}
                        className="flex items-center gap-1 text-accent hover:underline text-xs"
                      >
                        View
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-text-muted">No trades in the join window for this student.</p>
          </CardContent>
        </Card>
      )}

      {/* Info card about lazy loading */}
      <Card className="border-dashed bg-neutral-fill/30">
        <CardContent className="py-3 text-sm text-text-muted flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Trade replay data (chart, AI replay, decision analysis) is loaded only when you click "View" on a specific trade.
        </CardContent>
      </Card>
    </div>
  );
}
