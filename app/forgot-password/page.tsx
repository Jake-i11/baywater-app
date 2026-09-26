"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/AuthShell";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setError("");

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      // Supabase returns success even for unknown accounts (to prevent
      // user enumeration), so we always show the same confirmation message.
      await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSent(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Precept Solutions" subtitle="Reset your password">
      <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-base">
            {sent ? "Check your email" : "Forgot your password?"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
                <p className="text-sm text-emerald-200">
                  If an account exists for <span className="font-semibold">{email.trim()}</span>, we&apos;ve
                  sent a password reset link. Check your inbox (and spam folder).
                </p>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                variant="outline"
                className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                {loading ? "Sending..." : "Resend link"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-white/50">
                Enter the email you signed up with and we&apos;ll send you a link to reset your password.
              </p>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoComplete="email"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-indigo-500 hover:bg-indigo-400"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Sending...
                  </span>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </>
          )}

          <Link
            href="/login"
            className="flex w-full items-center justify-center gap-1.5 text-center text-sm text-white/40 transition hover:text-white/70"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to login
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
