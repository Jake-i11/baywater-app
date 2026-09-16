"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const baseTabs = [
  { href: "", label: "Overview" },
  { href: "/roster", label: "Roster" },
  { href: "/performance", label: "Performance" },
];

// Global-admin-only tab. Visibility is UX only — the Coaches API/page enforce
// global-admin authorization server-side.
const adminTab = { href: "/coaches", label: "Coaches" };
const inviteTab = { href: "/invite", label: "Invite" };

export function FirmCoachNav({
  orgId,
  orgName,
  children,
}: {
  orgId: string;
  orgName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const base = `/firm/${orgId}`;
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/firm/context", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          is_global_admin?: boolean;
          organizations?: Array<{ organization_id: string }>;
        };
        const member = (body.organizations ?? []).some(
          (o) => o.organization_id === orgId
        );
        if (!cancelled) {
          setIsGlobalAdmin(Boolean(body.is_global_admin));
          setIsMember(member);
        }
      } catch {
        // Leave the nav at coach level; server still enforces admin access.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Coach tabs only for a coach of this firm; the Coaches and Invite tabs are
  // also shown to the single global admin (who is not a member of any firm but
  // manages coaches and invitations across firms).
  const tabs = [
    ...(isMember ? baseTabs : []),
    ...(isGlobalAdmin ? [adminTab] : []),
    ...(isMember || isGlobalAdmin ? [inviteTab] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Firm coach</p>
          <h1 className="text-2xl font-bold text-text-primary">{orgName}</h1>
        </div>
        <Link href="/firm" className="text-sm text-accent hover:underline">
          Switch organization
        </Link>
      </div>

      <nav className="flex gap-1 border-b border-card-border">
        {tabs.map((tab) => {
          const href = `${base}${tab.href}`;
          const active =
            tab.href === ""
              ? pathname === base
              : pathname.startsWith(href);
          return (
            <Link
              key={tab.href || "overview"}
              href={href}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

export function FirmLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-text-muted">{label}</p>
      </div>
    </div>
  );
}

export function FirmEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-card-bg p-8 text-center">
      <h2 className="text-lg font-medium text-text-primary">{title}</h2>
      <p className="mt-2 text-sm text-text-muted">{body}</p>
    </div>
  );
}

export function formatCoachPL(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatCoachRate(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatCoachPF(
  value: number | null,
  uncapped?: boolean
): string {
  if (uncapped) return "∞";
  if (value === null || value === undefined) return "—";
  return value.toFixed(2);
}
