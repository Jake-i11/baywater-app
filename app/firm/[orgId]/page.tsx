"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FirmCoachNav,
  FirmEmpty,
  FirmLoading,
  formatCoachPF,
  formatCoachPL,
  formatCoachRate,
} from "@/components/firm/FirmCoachShell";
import type { FirmCoachOverviewResponse } from "@/lib/firm/types";

export default function FirmOverviewPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;
  const [data, setData] = useState<FirmCoachOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/firm/${orgId}/overview`, { cache: "no-store" });
        if (res.status === 401) {
          router.replace(`/login?next=/firm/${orgId}`);
          return;
        }
        if (res.status === 404) {
          if (!cancelled) setError("Not found");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("Failed to load overview");
          return;
        }
        const json = (await res.json()) as FirmCoachOverviewResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Failed to load overview");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, router]);

  if (error === "Not found") {
    return <FirmEmpty title="Not found" body="This firm page isn’t available." />;
  }
  if (error) {
    return <FirmEmpty title="Error" body={error} />;
  }
  if (!data) {
    return <FirmLoading label="Loading firm overview…" />;
  }

  const m = data.metrics;
  const empty = data.student_count === 0;

  return (
    <FirmCoachNav orgId={orgId} orgName={data.organization_name}>
      {empty ? (
        <FirmEmpty
          title="No students yet"
          body="Invite students to this firm to see aggregate performance here."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Students" value={String(data.student_count)} />
          <MetricCard label="Trades" value={String(m.trade_count)} />
          <MetricCard label="Net P&L" value={formatCoachPL(m.total_pl)} />
          <MetricCard label="Win rate" value={formatCoachRate(m.win_rate)} />
          <MetricCard
            label="Profit factor"
            value={formatCoachPF(m.profit_factor, m.profit_factor_uncapped)}
          />
          <MetricCard
            label="Avg discipline"
            value={
              m.average_discipline_score != null
                ? Math.round(m.average_discipline_score).toString()
                : "—"
            }
          />
        </div>
      )}
    </FirmCoachNav>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-card-bg p-4">
      <div className="text-xs uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}
