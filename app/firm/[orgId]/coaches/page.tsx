"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FirmCoachNav,
  FirmEmpty,
  FirmLoading,
} from "@/components/firm/FirmCoachShell";

interface CoachRow {
  id: string;
  pseudonym: string;
  role?: "coach" | "admin";
  joined_at?: string;
}

interface CoachesResponse {
  organization_id: string;
  organization_name: string;
  is_global_admin: boolean;
  coaches: CoachRow[];
}

/**
 * GLOBAL-ADMIN-ONLY coach management page.
 *
 * Every request below is authorized server-side (getGlobalAdminContext + the
 * firm_coach_list / firm_revoke_membership / firm_create_invitation RPCs).
 * A coach or student who navigates here manually gets an unauthorized/not-found
 * result from the API rather than data.
 */
export default function FirmCoachesPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;

  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [orgName, setOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);

  // Delete-firm confirmation must be explicit: the admin types the firm name.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loginPath = `/login?next=/firm/${orgId}/coaches`;

  const loadCoaches = useCallback(async () => {
    try {
      const res = await fetch(`/api/firm/${orgId}/coaches`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace(loginPath);
        return;
      }
      if (!res.ok) {
        setError("Not found");
        return;
      }
      const body = (await res.json()) as CoachesResponse;
      setOrgName(body.organization_name ?? "");
      setCoaches(body.coaches ?? []);
    } catch {
      setError("Failed to load coaches");
    } finally {
      setLoading(false);
    }
  }, [orgId, router, loginPath]);

  useEffect(() => {
    loadCoaches();
  }, [loadCoaches]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    setInviteError(null);
    setInviteUrl(null);

    try {
      const res = await fetch(`/api/firm/${orgId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "coach" }),
      });
      if (res.status === 401) {
        router.replace(loginPath);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to create coach invitation");
      }
      const body = (await res.json()) as { inviteUrl: string | null };
      setInviteUrl(body.inviteUrl ?? null);
      setEmail("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create coach invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setInviteError("Failed to copy to clipboard");
    }
  };

  const handleRevoke = async (coach: CoachRow) => {
    if (
      !window.confirm(
        `Revoke coach access for ${coach.pseudonym}? They will immediately lose coach access to this firm.`
      )
    ) {
      return;
    }

    setRevokingId(coach.id);
    setRevokeError(null);
    setRevokeSuccess(null);

    try {
      const res = await fetch(`/api/firm/${orgId}/memberships/${coach.id}/revoke`, {
        method: "POST",
      });
      if (res.status === 401) {
        router.replace(loginPath);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to revoke coach");
      }
      setRevokeSuccess(`Revoked coach access for ${coach.pseudonym}.`);
      await loadCoaches();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke coach");
    } finally {
      setRevokingId(null);
    }
  };

  const handleDeleteFirm = async () => {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/firm/${orgId}`, { method: "DELETE" });
      if (res.status === 401) {
        router.replace(loginPath);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to delete firm");
      }
      router.replace("/firm");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete firm");
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmMatches =
    orgName.trim() !== "" && confirmName.trim() === orgName.trim();

  if (error === "Not found") {
    return <FirmEmpty title="Not found" body="This firm page isn't available." />;
  }
  if (error) {
    return <FirmEmpty title="Error" body={error} />;
  }
  if (loading) {
    return <FirmLoading label="Loading coaches…" />;
  }

  return (
    <FirmCoachNav orgId={orgId} orgName={orgName}>
      <div className="flex flex-col gap-6">
        {/* Invite a coach */}
        <form
          onSubmit={handleInvite}
          className="rounded-lg border border-card-border bg-card-bg p-6"
        >
          <h2 className="text-lg font-medium text-text-primary">Invite a coach</h2>
          <p className="mt-1 text-sm text-text-muted">
            As the Baywater global admin, you can invite and revoke coaches across
            firms. The recipient signs in with this email address to accept and
            become a coach.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="coach-email" className="block text-sm font-medium text-text-primary">
                Coach email
              </label>
              <input
                id="coach-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
              />
            </div>
            <button
              type="submit"
              disabled={isInviting}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                isInviting
                  ? "cursor-not-allowed bg-accent/50 text-accent-foreground"
                  : "bg-accent text-accent-foreground hover:bg-accent/90"
              }`}
            >
              {isInviting ? "Creating…" : "Invite coach"}
            </button>
          </div>

          {inviteError && (
            <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
              {inviteError}
            </div>
          )}

          {inviteUrl && (
            <div className="mt-4">
              <p className="text-sm text-text-muted">
                Share this one-time invite link with the coach:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={inviteUrl}
                  readOnly
                  className="flex-1 rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                    copied
                      ? "bg-accent/20 text-accent"
                      : "bg-accent text-accent-foreground hover:bg-accent/90"
                  }`}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Coach roster */}
        <div className="rounded-lg border border-card-border bg-card-bg p-6">
          <h2 className="text-lg font-medium text-text-primary">Coaches</h2>
          <p className="mt-1 text-sm text-text-muted">
            {coaches.length} active {coaches.length === 1 ? "coach" : "coaches"}
          </p>

          {revokeError && (
            <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
              {revokeError}
            </div>
          )}
          {revokeSuccess && (
            <div className="mt-4 rounded bg-success/10 p-3 text-sm text-success">
              {revokeSuccess}
            </div>
          )}

          {coaches.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">
              No coaches yet. Invite one above to get started.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-card-border">
              <table className="w-full text-sm">
                <thead className="bg-neutral-fill text-text-muted text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Coach</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coaches.map((coach) => (
                    <tr key={coach.id} className="border-t border-card-border">
                      <td className="px-4 py-3">
                        <span className="font-medium text-text-primary">{coach.pseudonym}</span>
                        <span className="ml-2 font-mono text-xs text-text-muted">
                          #{coach.id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {coach.joined_at
                          ? new Date(coach.joined_at).toLocaleDateString()
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRevoke(coach)}
                          disabled={revokingId === coach.id}
                          className="text-sm text-destructive hover:underline disabled:opacity-50"
                        >
                          {revokingId === coach.id ? "Revoking…" : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Danger zone — global admin only (server and RPC re-enforce). */}
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6">
          <h2 className="text-lg font-medium text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-text-muted">
            Deleting this firm permanently removes its memberships, assignments,
            invitations, pseudonym labels and audit history. Student trades,
            profiles and every other firm are left untouched.
          </p>

          {deleteError && (
            <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
              {deleteError}
            </div>
          )}

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => {
                setShowDeleteConfirm(true);
                setConfirmName("");
                setDeleteError(null);
              }}
              className="mt-4 rounded border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              Delete firm
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-text-primary">
                Type <span className="font-semibold">{orgName}</span> to confirm
                permanent deletion.
              </p>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={orgName}
                className="block w-full rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isDeleting || !confirmMatches}
                  onClick={handleDeleteFirm}
                  className={`rounded px-4 py-2 text-sm font-medium text-white transition-colors ${
                    isDeleting || !confirmMatches
                      ? "cursor-not-allowed bg-destructive/40"
                      : "bg-destructive hover:bg-destructive/90"
                  }`}
                >
                  {isDeleting ? "Deleting…" : "Permanently delete firm"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setConfirmName("");
                    setDeleteError(null);
                  }}
                  className="rounded border border-card-border px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </FirmCoachNav>
  );
}
