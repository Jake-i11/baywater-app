"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/AuthShell";

const MIN_PASSWORD_LENGTH = 8;

type Status = "checking" | "ready" | "invalid" | "success";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Validate the recovery token from the email link on mount.
  // Supports both PKCE (?code=...) and implicit (#access_token=...) flows.
  useEffect(() => {
    let cancelled = false;

    async function validateResetToken() {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (code) {
          // PKCE flow: exchange the code for a recovery session.
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          // Remove the one-time code from the URL so a refresh can't reuse it.
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }

        // Implicit flow: supabase-js picks up #access_token automatically.
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;
        setStatus(user ? "ready" : "invalid");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    }

    validateResetToken();
    return () => {
      cancelled = true;
    };
  }, []);

  // After a successful password update, bounce the user to the login page.
  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => {
      router.push("/login?reset=success");
    }, 2500);
    return () => clearTimeout(timer);
  }, [status, router]);

  const handleSubmit = useCallback(async () => {
    setError("");

    if (!password) {
      setError("Please enter a new password.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please try again.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(mapUpdateError(error.message));
        return;
      }
      setStatus("success");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [password, confirmPassword]);

  return (
    <AuthShell title="Precept Solutions" subtitle="Reset your password">
      {status === "checking" && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardContent className="flex items-center justify-center gap-2 py-8">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            <p className="text-sm text-white/50">Verifying your reset link...</p>
          </CardContent>
        </Card>
      )}

      {status === "invalid" && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-red-400" />
              Invalid or expired link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-white/60">
              This password reset link is invalid or has expired. Reset links
              are single-use and expire after a short time.
            </p>
            <Link
              href="/forgot-password"
              className="block w-full rounded-lg bg-indigo-500 py-2 text-center text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              Request a new link
            </Link>
            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-1.5 text-center text-sm text-white/40 transition hover:text-white/70"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to login
            </Link>
          </CardContent>
        </Card>
      )}

      {status === "ready" && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-indigo-400" />
              Choose a new password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoComplete="new-password"
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
            />
            <p className="text-xs text-white/40">
              Use at least {MIN_PASSWORD_LENGTH} characters.
            </p>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-400"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Updating...
                </span>
              ) : (
                "Update password"
              )}
            </Button>

            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-1.5 text-center text-sm text-white/40 transition hover:text-white/70"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to login
            </Link>
          </CardContent>
        </Card>
      )}

      {status === "success" && (
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Password updated
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-white/60">
              Your password has been changed successfully. You&apos;ll be
              redirected to the login page in a moment.
            </p>
            <Link
              href="/login?reset=success"
              className="block w-full rounded-lg bg-indigo-500 py-2 text-center text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              Go to login
            </Link>
          </CardContent>
        </Card>
      )}
    </AuthShell>
  );
}

function mapUpdateError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("different from the old password")) {
    return "Your new password must be different from your current password.";
  }
  if (
    lower.includes("at least") ||
    lower.includes("password should") ||
    lower.includes("weak")
  ) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (lower.includes("session") || lower.includes("expired")) {
    return "Your reset link has expired. Please request a new one.";
  }
  return message;
}
