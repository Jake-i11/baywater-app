"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FirmEmpty,
  FirmLoading,
  formatCoachPF,
  formatCoachPL,
  formatCoachRate,
} from "@/components/firm/FirmCoachShell";
import type { FirmCoachStudentDetailResponse } from "@/lib/firm/types";

export default function FirmStudentDetailPage() {
  const params = useParams<{ orgId: string; membershipId: string }>();
  const router = useRouter();
  const { orgId, membershipId } = params;
  const [data, setData] = useState<FirmCoachStudentDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/firm/${orgId}/students/${membershipId}`,
          { cache: "no-store" }
        );
        if (res.status === 401) {
          router.replace(`/login?next=/firm/${orgId}/students/${membershipId}`);
          return;
        }
        if (res.status === 404) {
          if (!cancelled) setError("Not found");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("Failed to load student");
          return;
        }
        const json = (await res.json()) as FirmCoachStudentDetailResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load student");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, membershipId, router]);

  if (error === "Not found") {
    return <FirmEmpty title="Not found" body="This student isn’t available." />;
  }
  if (error) return <FirmEmpty title="Error" body={error} />;
  if (!data) return <FirmLoading label="Loading student…" />;

  const m = data.metrics;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/firm/${orgId}/roster`}
            className="text-sm text-accent hover:underline"
          >
            ← Roster
          </Link>
          <h1 className="text-2xl font-bold text-text-primary mt-1">{data.pseudonym}</h1>
          <p className="text-sm text-text-muted">
            Joined {new Date(data.joined_at).toLocaleDateString()} · screenshots not shared
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Trades" value={String(m.trade_count)} />
        <Stat label="Net P&L" value={formatCoachPL(m.total_pl)} />
        <Stat label="Win rate" value={formatCoachRate(m.win_rate)} />
        <Stat
          label="Profit factor"
          value={formatCoachPF(m.profit_factor, m.profit_factor_uncapped)}
        />
        <Stat
          label="Avg discipline"
          value={
            m.average_discipline_score != null
              ? String(Math.round(m.average_discipline_score))
              : "—"
          }
        />
      </div>

      {data.trades.length === 0 ? (
        <FirmEmpty
          title="No trades in window"
          body="This student has no trades on or after their join date that you can view."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-card-border">
          <table className="w-full text-sm">
            <thead className="bg-neutral-fill text-text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Ticker</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">P&L</th>
                <th className="px-4 py-3 font-medium">Discipline</th>
                <th className="px-4 py-3 font-medium">Setup</th>
                <th className="px-4 py-3 font-medium">AI review</th>
                <th className="px-4 py-3 font-medium">Violations</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((t) => (
                <tr key={t.id} className="border-t border-card-border align-top">
                  <td className="px-4 py-3 font-medium">{t.ticker ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                    {new Date(t.entry_time || t.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {t.realized_pl != null ? formatCoachPL(t.realized_pl) : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {t.discipline_score ?? "—"}
                  </td>
                  <td className="px-4 py-3">{t.setup_type ?? "—"}</td>
                  <td className="px-4 py-3 max-w-xs text-text-muted">
                    {t.ai_review?.summary ?? t.ai_review?.trade_grade ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {t.violations.length === 0 ? "—" : t.violations.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-card-bg p-4">
      <div className="text-xs uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-2 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
