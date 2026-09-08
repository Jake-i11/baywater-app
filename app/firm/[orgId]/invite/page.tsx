"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/server";
import { getCoachContext } from "@/lib/firm/context";
import { firmCreateInvitationWithToken } from "@/lib/firm/rpc";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await getCoachContext(orgId);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const inviteResult = await firmCreateInvitationWithToken({
        organizationId: orgId,
        role: formData.role,
        email: formData.email,
        expiresAt: expiresAt.toISOString(),
        origin: window.location.origin,
      });

      if (inviteResult.error) {
        throw new Error(inviteResult.error.message);
      }

      setInviteUrl(inviteResult.data?.inviteUrl ?? null);
      setFormData({ email: "", role: "student" });
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

  if (error === "Not found") {
    return <FirmEmpty title="Not found" body="This firm page isn’t available." />;
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
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvitations = async () => {
      try {
        const result = await getCoachContext(orgId);
        if (!result.ok) {
          throw new Error(result.error);
        }

        const supabase = await createClient();
        const { data, error } = await supabase
          .from("invitations")
          .select("id, email, role, status, created_at, expires_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setInvitations(data || []);
      } catch (err) {
        setInvitationsError(err instanceof Error ? err.message : "Failed to load invitations");
      } finally {
        setIsLoadingInvitations(false);
      }
    };

    fetchInvitations();
  }, [orgId]);
                ? "cursor-not-allowed bg-accent/50 text-accent-foreground"
                : "bg-accent text-accent-foreground hover:bg-accent/90"
            }`}
          >
            Send invitation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await getCoachContext(orgId);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const inviteResult = await firmCreateInvitationWithToken({
        organizationId: orgId,
        role: formData.role,
        email: formData.email,
        expiresAt: expiresAt.toISOString(),
        origin: window.location.origin,
      });

      if (inviteResult.error) {
        throw new Error(inviteResult.error.message);
      }

      setInviteUrl(inviteResult.data?.inviteUrl ?? null);
      setFormData({ email: "", role: "student" });

      // Refresh invitations after successful creation
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("invitations")
        .select("id, email, role, status, created_at, expires_at")
        .eq("organization_id", orgId)
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
        .order("created_at", { ascending: false });

      if (!error) setInvitations(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setIsSubmitting(false);
    }
  };
          </button>
        </form>
      )}
    </FirmCoachNav>
  );
}