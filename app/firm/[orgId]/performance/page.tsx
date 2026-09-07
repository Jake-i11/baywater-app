"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FirmCoachNav,
  FirmEmpty,
  FirmLoading,
  formatCoachPL,
  formatCoachRate,
} from "@/components/firm/FirmCoachShell";
import type { FirmCoachPerformanceResponse } from "@/lib/firm/types";

export default function FirmPerformancePage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;
  const [data, setData] = useState<FirmCoachPerformanceResponse | null>(null);
  const [orgName, setOrgName] = useState("Firm");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [overviewRes, perfRes] = await Promise.all([
          fetch(`/api/firm/${orgId}/overview`, { cache: "no-store" }),
          fetch(`/api/firm/${orgId}/performance`, { cache: "no-store" }),
        ]);
        if (overviewRes.status === 401 || perfRes.status === 401) {
          router.replace(`/login?next=/firm/${orgId}/performance`);
          return;
        }
        if (overviewRes.status === 404 || perfRes.status === 404) {
          if (!cancelled) setError("Not found");
          return;
        }
        if (!perfRes.ok) {
          if (!cancelled) setError("Failed to load performance");
          return;
        }
        const overview = await overviewRes.json();
        const perf = (await perfRes.json()) as FirmCoachPerformanceResponse;
        if (!cancelled) {
          setOrgName(overview.organization_name ?? "Firm");
          setData(perf);
        }
      } catch {
        if (!cancelled) setError("Failed to load performance");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, router]);

  if (error === "Not found") {
    return <FirmEmpty title="Not found" body="This firm page isn’t available." />;
  }
  if (error) return <FirmEmpty title="Error" body={error} />;
  if (!data) return <FirmLoading label="Loading performance…" />;

  const empty =
    data.by_setup_type.length === 0 &&
    data.by_violation_type.length === 0 &&
    data.by_position_sizing.length === 0 &&
    data.by_entry_hour.every((b) => b.trade_count === 0);

  return (
    <FirmCoachNav orgId={orgId} orgName={orgName}>
      {empty ? (
        <FirmEmpty
          title="No performance data yet"
          body="Authorized students don’t have trades in their join window yet."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="By setup type">
            <BucketTable rows={data.by_setup_type} />
          </Section>
          <Section title="By entry hour">
            <BucketTable rows={data.by_entry_hour.filter((r) => r.trade_count > 0)} />
          </Section>
          <Section title="By position sizing">
            <BucketTable rows={data.by_position_sizing} />
          </Section>
          <Section title="Common violation types">
            {data.by_violation_type.length === 0 ? (
              <p className="text-sm text-text-muted">No violations recorded.</p>
            ) : (
              <ul className="space-y-2">
                {data.by_violation_type.map((v) => (
                  <li
                    key={v.key}
                    className="flex justify-between rounded border border-card-border px-3 py-2 text-sm"
                  >
                    <span>{v.label}</span>
                    <span className="tabular-nums text-text-muted">{v.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </FirmCoachNav>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-card-border bg-card-bg p-4">
      <h2 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function BucketTable({
  rows,
}: {
  rows: Array<{
    key: string;
    label: string;
    trade_count: number;
    total_pl: number;
    win_rate: number | null;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No data.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-text-muted text-left">
        <tr>
          <th className="pb-2 font-medium">Bucket</th>
          <th className="pb-2 font-medium">Trades</th>
          <th className="pb-2 font-medium">P&L</th>
          <th className="pb-2 font-medium">Win rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-card-border/60">
            <td className="py-2">{r.label}</td>
            <td className="py-2 tabular-nums">{r.trade_count}</td>
            <td className="py-2 tabular-nums">{formatCoachPL(r.total_pl)}</td>
            <td className="py-2 tabular-nums">{formatCoachRate(r.win_rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
