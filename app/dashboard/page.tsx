"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@supabase/supabase-js";

type Trade = {
  id: string;
  ticker: string;
  entry: string;
  exit: string;
  size: string;
  time: string;
  violations: string;
  created_at: string;
};

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);

      if (sessionUser) {
        const { data: tradeData } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", sessionUser.id)
          .order("created_at", { ascending: false });

        setTrades(tradeData ?? []);
      }
      setLoading(false);
    });
  }, []);

  const totalTrades = trades.length;
  const violationTrades = trades.filter((t) => {
    const v = JSON.parse(t.violations || "[]");
    return v.length > 0;
  });
  const complianceRate =
    totalTrades === 0
      ? 100
      : Math.round(((totalTrades - violationTrades.length) / totalTrades) * 100);

  // Shared background style
  const bgStyle = {
    background: 'linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)',
    backgroundImage: `
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)
    `,
    backgroundSize: '40px 40px, 40px 40px, 100% 100%',
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/50" style={bgStyle}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 text-white"
        style={bgStyle}
      >
        <p className="text-white/50">You need to be logged in to view your history.</p>
        <a
          href="/login"
          className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
        >
          Log in
        </a>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={bgStyle}
    >
      {/* orbs – green tinted */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-emerald-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-green-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-lime-500 opacity-10 blur-[160px]" />
      </div>

      {/* NAVBAR */}
      <nav className="flex items-center justify-between px-10 py-6">
        <a href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-semibold">Baywater</span>
        </a>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-white/50 hover:text-white">
            Analyze
          </a>
          <span className="text-sm font-medium text-white">History</span>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl space-y-6 px-6 pb-20 pt-6">
        {/* STATS ROW */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Total trades</p>
              <p className="mt-1 text-3xl font-bold">{totalTrades}</p>
            </CardContent>
          </Card>
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Violations</p>
              <p className="mt-1 text-3xl font-bold text-red-400">
                {violationTrades.length}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
            <CardContent className="pt-6">
              <p className="text-xs text-white/50">Compliance rate</p>
              <p
                className={`mt-1 text-3xl font-bold ${
                  complianceRate >= 80 ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {complianceRate}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* TRADE TABLE */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Trade History</CardTitle>
          </CardHeader>
          <CardContent>
            {trades.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-white/40">No trades logged yet.</p>
                <a
                  href="/"
                  className="mt-3 inline-block text-sm text-emerald-400 hover:text-emerald-300"
                >
                  Analyze your first trade →
                </a>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-white/40">
                      <th className="pb-3 pr-4">Date</th>
                      <th className="pb-3 pr-4">Ticker</th>
                      <th className="pb-3 pr-4">Entry</th>
                      <th className="pb-3 pr-4">Exit</th>
                      <th className="pb-3 pr-4">Size</th>
                      <th className="pb-3">Violations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => {
                      const violations = JSON.parse(trade.violations || "[]");
                      const hasViolation = violations.length > 0;
                      return (
                        <tr
                          key={trade.id}
                          className={`border-b border-white/5 ${
                            hasViolation ? "bg-red-500/5" : ""
                          }`}
                        >
                          <td className="py-3 pr-4 text-white/40">
                            {new Date(trade.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-4 font-semibold">
                            {trade.ticker ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {trade.entry ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {trade.exit ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-white/70">
                            {trade.size ?? "—"}
                          </td>
                          <td className="py-3">
                            {hasViolation ? (
                              <div className="flex flex-wrap gap-1">
                                {violations.map((v: string, i: number) => (
                                  <span
                                    key={i}
                                    className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400"
                                  >
                                    {v}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                                Clean
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}