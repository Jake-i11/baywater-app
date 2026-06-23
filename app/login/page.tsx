"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError("");

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070d] text-white">

      {/* orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-blue-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-purple-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-cyan-500 opacity-10 blur-[160px]" />
      </div>

      <div className="w-full max-w-sm px-6">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Baywater</h1>
          <p className="text-sm text-white/50">
            {isSignUp ? "Create an account to save your trades" : "Welcome back"}
          </p>
        </div>

        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-base">{isSignUp ? "Sign up" : "Log in"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-indigo-500 hover:bg-indigo-400"
            >
              {loading ? "..." : isSignUp ? "Create account" : "Log in"}
            </Button>

            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
              className="w-full text-center text-sm text-white/40 hover:text-white/70"
            >
              {isSignUp ? "Already have an account? Log in" : "No account? Sign up"}
            </button>

            <div className="relative flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <a href="/" className="block w-full rounded-md border border-white/10 py-2 text-center text-sm text-white/50 transition hover:border-white/20 hover:text-white/80">Continue as guest</a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
