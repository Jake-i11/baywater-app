"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FirmCoachNav, FirmEmpty, FirmLoading } from "@/components/firm/FirmCoachShell";

interface Invitation {
  id: string;
  email: string;
  role: "coach" | "student";
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: string;
  expires_at: string;
}

interface InviteFormData {
  email: string;
  role: "coach" | "student";
}

export default function FirmInvitePage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;
  const [formData, setFormData] = useState<InviteFormData>({ email: "", role: "student" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);

  const refreshInvitations = useCallback(async () => {
    try {
      const res = await fetch(`/api/firm/${orgId}/invitations`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace(`/login?next=/firm/${orgId}/invite`);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load invitations");
      }
      const body = (await res.json()) as { invitations: Invitation[] };
      setInvitations(body.invitations ?? []);
    } catch (err) {
      setInvitationsError(err instanceof Error ? err.message : "Failed to load invitations");
    } finally {
      setIsLoadingInvitations(false);
    }
  }, [orgId, router]);

  useEffect(() => {
    refreshInvitations();
  }, [refreshInvitations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/firm/${orgId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, role: formData.role }),
      });
      if (res.status === 401) {
        router.replace(`/login?next=/firm/${orgId}/invite`);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to create invitation");
      }
      const body = (await res.json()) as { inviteUrl: string | null };

      setInviteUrl(body.inviteUrl ?? null);
      setFormData({ email: "", role: "student" });

      // Refresh invitations after successful creation
      await refreshInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const getStatusDisplay = (status: string, expiresAt: string): string => {
    if (status === "pending" && new Date(expiresAt) < new Date()) {
      return "Expired";
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusColor = (status: string, expiresAt: string): string => {
    if (status === "pending" && new Date(expiresAt) < new Date()) {
      return "bg-yellow-100 text-yellow-800";
    }
    switch (status) {
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "accepted":
        return "bg-green-100 text-green-800";
      case "declined":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (error === "Not found") {
    return <FirmEmpty title="Not found" body="This firm page isn't available." />;
  }

  if (inviteUrl) {
    return (
      <FirmCoachNav orgId={orgId} orgName="">
        <div className="rounded-lg border border-card-border bg-card-bg p-8">
          <h2 className="text-lg font-medium text-text-primary">Invitation Created</h2>
          <p className="mt-2 text-sm text-text-muted">Share this link with the recipient:</p>
          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              value={inviteUrl}
              readOnly
              className="flex-1 rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
            />
            <button
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
      </FirmCoachNav>
    );
  }

  return (
    <FirmCoachNav orgId={orgId} orgName="">
      {isSubmitting ? (
        <FirmLoading label="Creating invitation…" />
      ) : (
        <form onSubmit={handleSubmit} className="rounded-lg border border-card-border bg-card-bg p-8">
          <h2 className="text-lg font-medium text-text-primary">Create Invitation</h2>
          <div className="mt-4">
            <label htmlFor="email" className="block text-sm font-medium text-text-primary">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1 block w-full rounded border border-card-border bg-card-bg p-2 text-sm text-text-primary"
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-text-primary">Role</label>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value="student"
                  checked={formData.role === "student"}
                  onChange={() => setFormData({ ...formData, role: "student" })}
                  className="h-4 w-4 text-accent focus:ring-accent"
                />
                Student
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value="coach"
                  checked={formData.role === "coach"}
                  onChange={() => setFormData({ ...formData, role: "coach" })}
                  className="h-4 w-4 text-accent focus:ring-accent"
                />
                Coach
              </label>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`mt-6 rounded px-4 py-2 text-sm font-medium transition-colors ${
              isSubmitting
                ? "cursor-not-allowed bg-accent/50 text-accent-foreground"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
            }`}
          >
            Send invitation
          </button>
        </form>
      )}
    </FirmCoachNav>
  );
}
