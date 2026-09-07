"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildInvitePath, hashInvitationTokenWeb } from "@/lib/firm/tokens";
import { FIRM_INVITE_STUDENT_DISCLOSURE } from "@/lib/firm/disclosure";

type InvitePreview = {
  invitation_id: string;
  organization_id: string;
  organization_name: string;
  role: string;
  status: string;
  email_bound: string;
  expires_at: string;
  is_expired: boolean;
  created_at: string;
};

const DISCLOSURE = FIRM_INVITE_STUDENT_DISCLOSURE;

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const rawToken = useMemo(() => {
    const t = params?.token;
    if (!t) return "";
    try {
      return decodeURIComponent(Array.isArray(t) ? t[0] : t);
    } catch {
      return Array.isArray(t) ? t[0] : t;
    }
  }, [params]);

  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setDoneMessage(null);

      if (!rawToken) {
        setError("This invite link is missing a token.");
        setLoading(false);
        return;
      }

      try {
        const hash = await hashInvitationTokenWeb(rawToken);
        if (cancelled) return;
        setTokenHash(hash);

        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData.session?.user ?? null;
        setUserEmail(sessionUser?.email ?? null);

        const { data, error: previewError } = await supabase.rpc(
          "firm_preview_invitation",
          { p_token_hash: hash }
        );

        if (cancelled) return;

        if (previewError) {
          setError(
            previewError.message.includes("invitation not found")
              ? "This invite link is invalid or has been removed."
              : previewError.message
          );
          setPreview(null);
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          setPreview(row as InvitePreview);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load invitation");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  function requireAuth() {
    const next = buildInvitePath(rawToken);
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  async function handleAccept() {
    if (!tokenHash) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
      requireAuth();
      return;
    }

    setActing(true);
    setError(null);
    try {
      const { data, error: acceptError } = await supabase.rpc(
        "firm_accept_invitation",
        { p_token_hash: tokenHash }
      );
      if (acceptError) {
        setError(acceptError.message);
        return;
      }
      const result = data as { pseudonym?: string; role?: string };
      setDoneMessage(
        result?.pseudonym
          ? `You're in. Your coach-facing label is ${result.pseudonym}.`
          : "Invitation accepted. Your firm membership is now active."
      );
      setPreview((prev) => (prev ? { ...prev, status: "accepted" } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setActing(false);
    }
  }

  async function handleDecline() {
    if (!tokenHash) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
      requireAuth();
      return;
    }

    setActing(true);
    setError(null);
    try {
      const { error: declineError } = await supabase.rpc(
        "firm_decline_invitation",
        { p_token_hash: tokenHash }
      );
      if (declineError) {
        setError(declineError.message);
        return;
      }
      setDoneMessage("Invitation declined. No firm membership was created.");
      setPreview((prev) => (prev ? { ...prev, status: "declined" } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decline failed");
    } finally {
      setActing(false);
    }
  }

  const canAct =
    preview &&
    preview.status === "pending" &&
    !preview.is_expired &&
    !doneMessage;

  return (
    <AuthShell
      title="Firm invitation"
      subtitle={
        preview
          ? `${preview.organization_name} · ${preview.role}`
          : "Review this firm invitation"
      }
    >
      <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading invitation…" : preview?.organization_name ?? "Invitation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-white/80">
          {loading && <p className="text-white/50">Checking invite details…</p>}

          {!loading && error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {!loading && preview && (
            <>
              <div className="space-y-1 text-white/60">
                <p>
                  Status:{" "}
                  <span className="text-white">
                    {preview.is_expired && preview.status === "pending"
                      ? "expired"
                      : preview.status}
                  </span>
                </p>
                <p>
                  Role: <span className="text-white">{preview.role}</span>
                </p>
                <p>
                  Invited email:{" "}
                  <span className="text-white">{preview.email_bound}</span>
                </p>
                <p>
                  Expires:{" "}
                  <span className="text-white">
                    {new Date(preview.expires_at).toLocaleString()}
                  </span>
                </p>
                {userEmail && (
                  <p>
                    Signed in as: <span className="text-white">{userEmail}</span>
                  </p>
                )}
              </div>

              {preview.role === "student" && canAct && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-50/90">
                  <p className="font-medium text-amber-100">Before you accept</p>
                  <p className="mt-2 leading-relaxed">{DISCLOSURE}</p>
                </div>
              )}

              {preview.role === "coach" && canAct && (
                <div className="rounded-md border border-white/15 bg-white/5 p-3 text-white/70">
                  <p>
                    Accepting will add you as a coach in{" "}
                    <span className="text-white">{preview.organization_name}</span>.
                    You will be able to view authorized students&apos; trading
                    performance and analytics under this firm&apos;s access rules.
                  </p>
                </div>
              )}

              {doneMessage && (
                <p className="text-sm text-emerald-400">{doneMessage}</p>
              )}

              {canAct && !userEmail && (
                <div className="space-y-2">
                  <p className="text-white/50">
                    Sign in or create an account with{" "}
                    <span className="text-white">{preview.email_bound}</span> to
                    continue.
                  </p>
                  <Button
                    onClick={requireAuth}
                    className="w-full bg-indigo-500 hover:bg-indigo-400"
                  >
                    Sign in to continue
                  </Button>
                </div>
              )}

              {canAct && userEmail && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={handleAccept}
                    disabled={acting}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-400"
                  >
                    {acting ? "Working…" : "Accept invitation"}
                  </Button>
                  <Button
                    onClick={handleDecline}
                    disabled={acting}
                    variant="outline"
                    className="flex-1 border-white/20 bg-transparent text-white hover:bg-white/10"
                  >
                    Decline
                  </Button>
                </div>
              )}

              {doneMessage && (
                <Button
                  onClick={() => router.push("/dashboard")}
                  className="w-full bg-indigo-500 hover:bg-indigo-400"
                >
                  Go to dashboard
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
