"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

function formatNumber(num: number) {
  return num.toLocaleString("en-US");
}

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [rules, setRules] = useState({
    maxFloat: 10_000_000,
    minPrice: 2,
    maxPrice: 10,
    tradeBefore9AM: true,
    allowedTickers: ["AAPL", "TSLA", "NVDA"],
    maxTradesPerDay: 3,
  });

  // Display state for the formatted max float input
  const [floatDisplay, setFloatDisplay] = useState(formatNumber(rules.maxFloat));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleFloatChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/,/g, "");
      const num = raw === "" ? 0 : Number(raw);
      if (!isNaN(num)) {
        setRules((prev) => ({ ...prev, maxFloat: num }));
        setFloatDisplay(formatNumber(num));
      }
    },
    []
  );

  function checkRules(trade: any) {
    const violations: string[] = [];
    if (!trade) return violations;

    if (trade.ticker && !rules.allowedTickers.includes(trade.ticker))
      violations.push("Ticker not allowed");

    if (trade.price !== undefined) {
      const price = Number(trade.price);
      if (price < rules.minPrice) violations.push(`Price below $${rules.minPrice}`);
      if (price > rules.maxPrice) violations.push(`Price above $${rules.maxPrice}`);
    }

    if (rules.tradeBefore9AM && trade.time) {
      const timeStr = trade.time;
      const match = timeStr.match(/(\d{1,2}):?(\d{2})?/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        if (hours > 9 || (hours === 9 && minutes > 0)) {
          violations.push("Trade placed after 9:00 AM");
        }
      }
    }

    return violations;
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/analyze", { method: "POST", body: formData });
    const data = await res.json();
    const violations = checkRules(data);

    setResult({ ...data, violations });

    if (user) {
      await supabase.from("trades").insert([
        {
          ticker: data.ticker,
          entry: data.entry,
          exit: data.exit,
          size: data.size,
          time: data.time,
          violations: JSON.stringify(violations),
          user_id: user.id,
        },
      ]);
    }

    setLoading(false);
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{
        background: 'linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)',
        backgroundImage: `
          linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)
        `,
        backgroundSize: '40px 40px, 40px 40px, 100% 100%',
      }}
    >
      {/* orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-emerald-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-green-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-lime-500 opacity-10 blur-[160px]" />
      </div>

      {/* Minimal navbar */}
      <nav className="flex items-center justify-between px-10 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Baywater</span>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-sm text-white/50">{user.email}</span>
              <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
                History
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                }}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <a href="/login" className="text-sm text-white/70 hover:text-white">
                Log in
              </a>
              <a
                href="/login"
                className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
              >
                Sign up
              </a>
            </>
          )}
        </div>
      </nav>

      {/* Main content */}
      <div className="relative z-10 mx-auto max-w-2xl space-y-6 px-6 pb-20 pt-10">
        <div>
          <h1 className="text-3xl font-bold">Analyze Your Trade</h1>
          <p className="text-white/60">
            Set your rules, upload a screenshot, and get instant feedback.
          </p>
        </div>

        {!user && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-300">
            You&apos;re using Baywater as a guest — trades won&apos;t be saved.{" "}
            <a
              href="/login"
              className="font-semibold text-emerald-400 underline underline-offset-2 hover:text-white"
            >
              Log in to save your history.
            </a>
          </div>
        )}

        {/* UPDATED RULES CARD */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Your Trading Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Max Float with commas */}
            <div>
              <label className="text-sm text-white/60">Maximum Float</label>
              <Input
                type="text"
                inputMode="numeric"
                value={floatDisplay}
                onChange={handleFloatChange}
                className="border-white/10 bg-white/5 text-white mt-1"
                placeholder="10,000,000"
              />
              <p className="text-xs text-white/30 mt-1">
                (Display only – not auto‑checked)
              </p>
            </div>

            {/* Price Range */}
            <div>
              <label className="text-sm text-white/60">Price Range ($)</label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  value={rules.minPrice}
                  onChange={(e) =>
                    setRules({ ...rules, minPrice: Number(e.target.value) })
                  }
                  className="border-white/10 bg-white/5 text-white w-24"
                  placeholder="Min"
                />
                <span className="text-white/40">–</span>
                <Input
                  type="number"
                  value={rules.maxPrice}
                  onChange={(e) =>
                    setRules({ ...rules, maxPrice: Number(e.target.value) })
                  }
                  className="border-white/10 bg-white/5 text-white w-24"
                  placeholder="Max"
                />
              </div>
            </div>

            {/* Trade Before 9:00 AM */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rules.tradeBefore9AM}
                onChange={(e) =>
                  setRules({ ...rules, tradeBefore9AM: e.target.checked })
                }
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500"
              />
              <label className="text-sm text-white/60">
                Only allow trades before 9:00 AM
              </label>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Upload Trade Screenshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border-white/10 bg-white/5 text-white"
            />
            <Button onClick={handleUpload} disabled={loading}>
              {loading ? "Analyzing..." : "Analyze Trade"}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Extracted Trade</CardTitle>
            </CardHeader>
            <CardContent>
              {result.error ? (
                <pre className="text-sm text-red-400">{result.error}</pre>
              ) : (
                <ul className="space-y-1 text-sm text-white/80">
                  <li>
                    <b className="text-white">Ticker:</b> {result.ticker}
                  </li>
                  <li>
                    <b className="text-white">Entry:</b> {result.entry}
                  </li>
                  <li>
                    <b className="text-white">Exit:</b> {result.exit}
                  </li>
                  <li>
                    <b className="text-white">Size:</b> {result.size}
                  </li>
                  <li>
                    <b className="text-white">Time:</b> {result.time}
                  </li>
                </ul>
              )}
              {result?.violations?.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <h4 className="mb-1 text-sm font-semibold text-red-400">
                    Violations
                  </h4>
                  <ul className="space-y-1 text-sm text-red-300">
                    {result.violations.map((v: string, i: number) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}