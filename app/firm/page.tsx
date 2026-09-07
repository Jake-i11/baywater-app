"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FirmCoachOrgSummary } from "@/lib/firm/types";
import { FirmEmpty, FirmLoading } from "@/components/firm/FirmCoachShell";

export default function FirmIndexPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<FirmCoachOrgSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/firm/context", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login?next=/firm");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("Unable to load firm context");
          return;
        }
        const data = await res.json();
        const list = (data.organizations ?? []) as FirmCoachOrgSummary[];
        if (!cancelled) {
          if (list.length === 1) {
            router.replace(`/firm/${list[0].organization_id}`);
            return;
          }
          setOrgs(list);
        }
      } catch {
        if (!cancelled) setError("Unable to load firm context");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return <FirmEmpty title="Unavailable" body={error} />;
  }

  if (!orgs) {
    return <FirmLoading label="Loading firm coach…" />;
  }

  if (orgs.length === 0) {
    return (
      <FirmEmpty
        title="No firm coach access"
        body="You don’t have an active coach membership in any organization yet. Accept a coach invitation to get started."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Select organization</h1>
        <p className="text-sm text-text-muted mt-1">
          Choose which firm you want to coach.
        </p>
      </div>
      <ul className="space-y-2">
        {orgs.map((org) => (
          <li key={org.organization_id}>
            <Link
              href={`/firm/${org.organization_id}`}
              className="block rounded-lg border border-card-border bg-card-bg px-4 py-3 hover:border-accent transition-colors"
            >
              <div className="font-medium text-text-primary">{org.organization_name}</div>
              <div className="text-xs text-text-muted">
                Coach since {new Date(org.joined_at).toLocaleDateString()}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
