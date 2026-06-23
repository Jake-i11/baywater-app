"use client";

import { useState } from "react";
import { Flame, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [rules, setRules] = useState({
    maxTradesPerDay: 3,
    maxPositionSize: 1000,
    allowedTickers: ["AAPL", "TSLA", "NVDA"],
  });

  function checkRules(trade: any) {
    const violations: string[] = [];
    if (!trade) return violations;

    if (trade.ticker && !rules.allowedTickers.includes(trade.ticker)) {
      violations.push("Ticker not allowed");
    }
    if (trade.size && Number(trade.size) > rules.maxPositionSize) {
      violations.push("Position size too large");
    }
    return violations;
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    const violations = checkRules(data);

    setResult({ ...data, violations });
    setLoading(false);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] text-white">
      {/* ambient gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-blue-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-purple-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-cyan-500 opacity-10 blur-[160px]" />
      </div>

      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-10 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Baywater</span>
        </div>

        <div className="hidden rounded-full border border-white/10 bg-white/5 p-1 sm:flex">
          <button className="rounded-full bg-white/10 px-5 py-1.5 text-sm font-medium text-white">
            Trader
          </button>
          <button className="rounded-full px-5 py-1.5 text-sm font-medium text-white/50">
            Firm
          </button>
        </div>

        <div className="flex items-center gap-4">
          <a className="text-sm text-white/70 hover:text-white" href="#">Log in</a>
          <button className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400">
            Sign up
          </button>
        </div>
      </nav>

      {/* HERO */}
      <div className="relative mx-auto max-w-3xl px-6 pt-10 pb-24 text-center">
        <div className="absolute -left-6 top-2 hidden w-52 rounded-2xl border border-white/10 bg-[#101626]/80 p-4 backdrop-blur-xl md:block">
          <p className="text-xs text-white/50">Cost of violations</p>
          <p className="mt-1 text-2xl font-bold text-red-400">$1,240</p>
          <p className="mt-1 text-xs font-medium text-red-400">+18% vs last month</p>
        </div>

        <div className="absolute -right-10 top-16 hidden w-52 rounded-2xl border border-white/10 bg-[#101626]/80 p-4 backdrop-blur-xl md:block">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <p className="text-sm font-semibold">Discipline streak</p>
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live · 6 days
          </p>
        </div>

        <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Stop Breaking
          <br />
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Your Own Rules
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-white/60">
          Upload a screenshot of your trade. Claude checks it against your own
          rulebook and tells you exactly when, and how much, you broke it.
        </p>

        
          href="#upload"
          className="mt-8 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 px-8 py-3 font-semibold text-white shadow-xl shadow-indigo-500/30 transition hover:opacity-90"
        >
          Analyze My Trade
        </a>

        <div className="absolute -left-10 bottom-0 hidden w-52 rounded-2xl border border-white/10 bg-[#101626]/80 p-4 backdrop-blur-xl md:block">
          <p className="text-xs text-white/50">Trades analyzed</p>
          <p className="mt-1 text-2xl font-bold">128</p>
          <p className="mt-1 text-xs font-medium text-emerald-400">+12 this week</p>
        </div>

        <div className="absolute -right-6 bottom-2 hidden w-52 rounded-2xl border border-white/10 bg-[#101626]/80 p-4 backdrop-blur-xl md:block">
          <p className="text-xs text-white/50">Rule compliance</p>
          <div className="mt-1 flex items-center gap-1">
            <p className="text-2xl font-bold">82%</p>
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          </div>
          <p className="mt-1 text-xs font-medium text-emerald-400">Top tier this month</p>
        </div>
      </div>

      {/* FUNCTIONAL SECTION */}
      <div className="relative z-10 mx-auto max-w-2xl space-y-6 px-6 pb-20">
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Your Trading Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="text-sm text-white/60">Max position size</label>
            <Input
              type="number"
              value={rules.maxPositionSize}
              onChange={(e) =>
                setRules({ ...rules, maxPositionSize: Number(e.target.value) })
              }
              className="border-white/10 bg-white/5 text-white"
            />
          </CardContent>
        </Card>

        <Card id="upload" className="border border-white/10 bg-white/5 backdrop-blur-xl">
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
                  <li><b className="text-white">Ticker:</b> {result.ticker}</li>
                  <li><b className="text-white">Entry:</b> {result.entry}</li>
                  <li><b className="text-white">Exit:</b> {result.exit}</li>
                  <li><b className="text-white">Size:</b> {result.size}</li>
                  <li><b className="text-white">Time:</b> {result.time}</li>
                </ul>
              )}

              {result?.violations?.length > 0 && (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <h4 className="mb-1 text-sm font-semibold text-red-400">Violations</h4>
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
