"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FirmCoachNav,
  FirmEmpty,
  FirmLoading,
  formatCoachPL,
  formatCoachRate,
import { createClient } from "@/lib/server";
import { firmRevokeMembership } from "@/lib/firm/rpc";
} from "@/components/firm/FirmCoachShell";
import type { FirmCoachRosterResponse } from "@/lib/firm/types";

export default function FirmRosterPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;
  const [sort, setSort] = useState<FirmCoachRosterResponse["sort"]>("discipline");
  const [data, setData] = useState<FirmCoachRosterResponse | null>(null);
  const [orgName, setOrgName] = useState("Firm");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [overviewRes, rosterRes] = await Promise.all([
          fetch(`/api/firm/${orgId}/overview`, { cache: "no-store" }),
          fetch(`/api/firm/${orgId}/roster?sort=${sort}`, { cache: "no-store" }),
        ]);
        if (overviewRes.status === 401 || rosterRes.status === 401) {
          router.replace(`/login?next=/firm/${orgId}/roster`);
          return;
        }
        if (overviewRes.status === 404 || rosterRes.status === 404) {
          if (!cancelled) setError("Not found");
          return;
        }
        if (!rosterRes.ok) {
          if (!cancelled) setError("Failed to load roster");
          return;
        }
        const overview = await overviewRes.json();
        const roster = (await rosterRes.json()) as FirmCoachRosterResponse;
        if (!cancelled) {
          setOrgName(overview.organization_name ?? "Firm");
          setData(roster);
        }
      } catch {
        if (!cancelled) setError("Failed to load roster");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, router, sort]);

  if (error === "Not found") {
    return <FirmEmpty title="Not found" body="This firm page isn’t available." />;
  }
  if (error) return <FirmEmpty title="Error" body={error} />;
  if (!data) return <FirmLoading label="Loading roster…" />;

  return (
    <FirmCoachNav orgId={orgId} orgName={orgName}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-muted">{data.students.length} students</p>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as FirmCoachRosterResponse["sort"])}
          className="px-3 py-2 border border-card-border rounded-lg bg-card-bg text-text-primary text-sm"
        >
          <option value="discipline">Discipline</option>
          <option value="recent">Recent activity</option>
          <option value="pl">P&L</option>
          <option value="pseudonym">Pseudonym</option>
        </select>
      </div>

      {data.students.length === 0 ? (
        <FirmEmpty
          title="No authorized students"
          body="There are no active students you can view in this organization."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-card-border">
          <table className="w-full text-sm">
            <thead className="bg-neutral-fill text-text-muted text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Trades</th>
                <th className="px-4 py-3 font-medium">P&L</th>
                <th className="px-4 py-3 font-medium">Win rate</th>
                <th className="px-4 py-3 font-medium">Discipline</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr key={s.membership_id} className="border-t border-card-border hover:bg-neutral-fill/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/firm/${orgId}/students/${s.membership_id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {s.pseudonym}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(s.joined_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{s.trade_count}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCoachPL(s.total_pl)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatCoachRate(s.win_rate)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {s.average_discipline_score != null
                      ? Math.round(s.average_discipline_score)
                      : "—"}
                  </td>
                </tr>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRevoke(s.membership_id, s.pseudonym)}
                      className="text-sm text-destructive hover:underline"
                    >
                      Revoke
                    </button>
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  const handleRevoke = async (membershipId: string, pseudonym: string) => {
    if (!window.confirm(`Are you sure you want to revoke access for ${pseudonym}? This action cannot be undone.`)) {
      return;
    }

    setIsRevoking(true);
    setRevokeError(null);
    setRevokeSuccess(null);

    try {
      const result = await getCoachContext(orgId);
      if (!result.ok) {
        throw new Error(result.error);
      }

  {revokeError && (
    <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
      {revokeError}
    </div>
  )}
  {isRevoking && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-card-bg p-6 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-primary">Revoking membership...</p>
        </div>
      </div>
    </div>
  )}
  {revokeSuccess && (
    <div className="mt-4 rounded bg-success/10 p-3 text-sm text-success">
      {revokeSuccess}
    </div>
  )}
      const supabase = await createClient();
      const { error } = await supabase.rpc("firm_revoke_membership", {
        p_membership_id: membershipId,
      });

      if (error) throw error;
  // Add loading state for revocation
  {isRevoking && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-card-bg p-6 rounded-lg shadow-lg">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-text-primary">Revoking membership...</p>
        </div>
      </div>
    </div>
  )}

      setRevokeSuccess(`Successfully revoked ${pseudonym}'s access.`);

      // Refresh the roster
      const rosterRes = await fetch(`/api/firm/${orgId}/roster?sort=${sort}`, {
        cache: "no-store"
      });
      if (!rosterRes.ok) {
        throw new Error("Failed to refresh roster");
      }
      const roster = (await rosterRes.json()) as FirmCoachRosterResponse;
      setData(roster);
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke membership");
    } finally {
      setIsRevoking(false);
    }
  };
                  </td>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FirmCoachNav>
  );
}
