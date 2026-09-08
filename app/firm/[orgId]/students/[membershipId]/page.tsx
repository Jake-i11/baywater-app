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

import { useState, useEffect } from "react";
import { createClient } from "@/lib/server";
import { firmAssignCoachStudent } from "@/lib/firm/rpc";
import { getCoachContext } from "@/lib/firm/context";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/server";
import { firmAssignCoachStudent } from "@/lib/firm/rpc";
import { getCoachContext } from "@/lib/firm/context";
import { useState } from "react";
import { createClient } from "@/lib/server";
import { firmAssignCoachStudent } from "@/lib/firm/rpc";
import { getCoachContext } from "@/lib/firm/context";
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
  const [coaches, setCoaches] = useState<{ id: string; pseudonym: string }[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        const result = await getCoachContext(orgId);
        if (!result.ok) {
          throw new Error(result.error);
        }

        const supabase = await createClient();
        const { data, error } = await supabase
          .from("organization_memberships")
          .select("id, user_id")
          .eq("organization_id", orgId)
          .eq("role", "coach")
          .eq("status", "active");

        if (error) throw error;

        // Get pseudonyms for these coaches
        const coachIds = data.map((m) => m.user_id);
        const { data: pseudonyms, error: pseudoError } = await supabase
          .from("organization_memberships")
          .select("id, pseudonym")
          .in("user_id", coachIds)
          .eq("organization_id", orgId);

        if (pseudoError) throw pseudoError;

        setCoaches(
          data.map((m) => ({
            id: m.id,
            pseudonym: pseudonyms.find((p) => p.id === m.id)?.pseudonym || "Coach",
          }))
        );
  {coaches.length > 1 && (
    <div className="mt-8 rounded-lg border border-card-border bg-card-bg p-6">
      <h3 className="text-lg font-medium text-text-primary">Assign to Coach</h3>
      <div className="mt-4">
        <label htmlFor="coach-select" className="block text-sm font-medium text-text-primary">
          Select Coach
        </label>
        <select
          id="coach-select"
          value={selectedCoach}
          onChange={(e) => setSelectedCoach(e.target.value)}
          className="mt-1 block w-full rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
        >
          <option value="">Select a coach</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.pseudonym}
            </option>
          ))}
        </select>
      </div>
      {assignError && (
        <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
          {assignError}
        </div>
      )}
      {assignSuccess && (
        <div className="mt-4 rounded bg-success/10 p-3 text-sm text-success">
          {assignSuccess}
        </div>
      )}
      <button
        onClick={handleAssign}
        disabled={!selectedCoach || isAssigning}
        className={`mt-4 rounded px-4 py-2 text-sm font-medium transition-colors ${(!selectedCoach || isAssigning)
          ? "cursor-not-allowed bg-accent/50 text-accent-foreground"
          : "bg-accent text-accent-foreground hover:bg-accent/90"
        }`}
      >
        {isAssigning ? "Assigning..." : "Assign Student"}
      </button>
    </div>
  )}
      } catch (err) {
        console.error("Failed to fetch coaches:", err);
      }
    };

    if (orgId) {
      fetchCoaches();
    }
  }, [orgId]);

  const handleAssign = async () => {
    if (!selectedCoach) return;

    setIsAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      const result = await getCoachContext(orgId);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const supabase = await createClient();
      const { error } = await supabase.rpc("firm_assign_coach_student", {
        p_organization_id: orgId,
        p_coach_membership_id: selectedCoach,
        p_student_membership_id: membershipId,
      });

      if (error) throw error;

      setAssignSuccess("Successfully assigned student to coach.");
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign student");
    } finally {
      setIsAssigning(false);
    }
  };
          value={
            m.average_discipline_score != null
              ? String(Math.round(m.average_discipline_score))
              : "—"
  const [coaches, setCoaches] = useState<{ id: string; pseudonym: string }[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        const result = await getCoachContext(orgId);
        if (!result.ok) {
          throw new Error(result.error);
        }

        const supabase = await createClient();
        const { data, error } = await supabase
          .from("organization_memberships")
          .select("id, user_id")
          .eq("organization_id", orgId)
          .eq("role", "coach")
          .eq("status", "active");

        if (error) throw error;

        // Get pseudonyms for these coaches
        const coachIds = data.map((m) => m.user_id);
        const { data: pseudonyms, error: pseudoError } = await supabase
          .from("organization_memberships")
          .select("id, pseudonym")
          .in("user_id", coachIds)
          .eq("organization_id", orgId);

        if (pseudoError) throw pseudoError;

        setCoaches(
          data.map((m) => ({
            id: m.id,
            pseudonym: pseudonyms.find((p) => p.id === m.id)?.pseudonym || "Coach",
          }))
        );
  {coaches.length > 1 && (
    <div className="mt-8 rounded-lg border border-card-border bg-card-bg p-6">
      <h3 className="text-lg font-medium text-text-primary">Assign to Coach</h3>
      <div className="mt-4">
        <label htmlFor="coach-select" className="block text-sm font-medium text-text-primary">
          Select Coach
        </label>
        <select
          id="coach-select"
          value={selectedCoach}
          onChange={(e) => setSelectedCoach(e.target.value)}
          className="mt-1 block w-full rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
        >
          <option value="">Select a coach</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.pseudonym}
            </option>
          ))}
        </select>
      </div>
      {assignError && (
        <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
          {assignError}
        </div>
      )}
      {assignSuccess && (
        <div className="mt-4 rounded bg-success/10 p-3 text-sm text-success">
          {assignSuccess}
        </div>
      )}
      <button
        onClick={handleAssign}
        disabled={!selectedCoach || isAssigning}
        className={`mt-4 rounded px-4 py-2 text-sm font-medium transition-colors ${(!selectedCoach || isAssigning)
          ? "cursor-not-allowed bg-accent/50 text-accent-foreground"
          : "bg-accent text-accent-foreground hover:bg-accent/90"
        }`}
      >
        {isAssigning ? "Assigning..." : "Assign Student"}
      </button>
    </div>
  )}
      } catch (err) {
        console.error("Failed to fetch coaches:", err);
      }
    };

    if (orgId) {
      fetchCoaches();
    }
  }, [orgId]);

  const handleAssign = async () => {
    if (!selectedCoach) return;

    setIsAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      const result = await getCoachContext(orgId);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const supabase = await createClient();
      const { error } = await supabase.rpc("firm_assign_coach_student", {
        p_organization_id: orgId,
        p_coach_membership_id: selectedCoach,
        p_student_membership_id: membershipId,
      });

      if (error) throw error;

      setAssignSuccess("Successfully assigned student to coach.");
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign student");
    } finally {
      setIsAssigning(false);
    }
  };
          }
        />
      </div>

  const [coaches, setCoaches] = useState<{ id: string; pseudonym: string }[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        const result = await getCoachContext(orgId);
        if (!result.ok) {
          throw new Error(result.error);
        }

        const supabase = await createClient();
        const { data, error } = await supabase
          .from("organization_memberships")
          .select("id, user_id")
          .eq("organization_id", orgId)
          .eq("role", "coach")
          .eq("status", "active");

        if (error) throw error;

        // Get pseudonyms for these coaches
        const coachIds = data.map((m) => m.user_id);
        const { data: pseudonyms, error: pseudoError } = await supabase
          .from("organization_memberships")
          .select("id, pseudonym")
          .in("user_id", coachIds)
          .eq("organization_id", orgId);

        if (pseudoError) throw pseudoError;

        setCoaches(
          data.map((m) => ({
            id: m.id,
            pseudonym: pseudonyms.find((p) => p.id === m.id)?.pseudonym || "Coach",
          }))
        );
  {coaches.length > 1 && (
    <div className="mt-8 rounded-lg border border-card-border bg-card-bg p-6">
      <h3 className="text-lg font-medium text-text-primary">Assign to Coach</h3>
      <div className="mt-4">
        <label htmlFor="coach-select" className="block text-sm font-medium text-text-primary">
          Select Coach
        </label>
        <select
          id="coach-select"
          value={selectedCoach}
          onChange={(e) => setSelectedCoach(e.target.value)}
          className="mt-1 block w-full rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
        >
          <option value="">Select a coach</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.pseudonym}
            </option>
          ))}
        </select>
      </div>
      {assignError && (
        <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
          {assignError}
        </div>
      )}
      {assignSuccess && (
        <div className="mt-4 rounded bg-success/10 p-3 text-sm text-success">
          {assignSuccess}
        </div>
      )}
      <button
        onClick={handleAssign}
        disabled={!selectedCoach || isAssigning}
        className={`mt-4 rounded px-4 py-2 text-sm font-medium transition-colors ${(!selectedCoach || isAssigning)
          ? "cursor-not-allowed bg-accent/50 text-accent-foreground"
          : "bg-accent text-accent-foreground hover:bg-accent/90"
        }`}
      >
        {isAssigning ? "Assigning..." : "Assign Student"}
      </button>
    </div>
  )}
      } catch (err) {
        console.error("Failed to fetch coaches:", err);
      }
    };

    if (orgId) {
      fetchCoaches();
    }
  }, [orgId]);

  const handleAssign = async () => {
    if (!selectedCoach) return;

    setIsAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      const result = await getCoachContext(orgId);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const supabase = await createClient();
      const { error } = await supabase.rpc("firm_assign_coach_student", {
        p_organization_id: orgId,
        p_coach_membership_id: selectedCoach,
        p_student_membership_id: membershipId,
      });

      if (error) throw error;

      setAssignSuccess("Successfully assigned student to coach.");
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign student");
    } finally {
      setIsAssigning(false);
    }
  };
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
