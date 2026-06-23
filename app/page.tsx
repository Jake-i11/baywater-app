"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Flame, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{
        // Dark green gradient (deep forest to almost black)
        background: 'linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)',
        backgroundImage: `
          linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
          linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)
        `,
        backgroundSize: '40px 40px, 40px 40px, 100% 100%',
      }}
    >
      {/* orbs – unchanged but slightly adjusted for green vibe */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-emerald-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-green-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-lime-500 opacity-10 blur-[160px]" />
      </div>

      {/* NAVBAR – unchanged */}
      <nav className="flex items-center justify-between px-10 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
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
          {user ? (
            <>
              <span className="text-sm text-white/50">{user.email}</span>
              <a href="/dashboard" className="text-sm text-white/70 hover:text-white">
                History
              </a>
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

      {/* HERO – unchanged */}
      <div className="relative mx-auto max-w-3xl px-6 pt-10 pb-24 text-center">
        <div className="absolute -left-6 top-2 hidden w-52 rounded-2xl border border-white/10 bg-[#0d2415]/80 p-4 backdrop-blur-xl md:block">
          <p className="text-xs text-white/50">Cost of violations</p>
          <p className="mt-1 text-2xl font-bold text-red-400">$1,240</p>
          <p className="mt-1 text-xs font-medium text-red-400">+18% vs last month</p>
        </div>

        <div className="absolute -right-10 top-16 hidden w-52 rounded-2xl border border-white/10 bg-[#0d2415]/80 p-4 backdrop-blur-xl md:block">
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
          <span className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
            Your Own Rules
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-white/60">
          Upload a screenshot of your trade. Claude checks it against your own rulebook.
        </p>

        <Link
          href="/analyze"
          className="mt-8 inline-block rounded-full bg-gradient-to-r from-emerald-500 to-green-500 px-8 py-3 font-semibold text-white shadow-xl shadow-emerald-500/30 transition hover:opacity-90"
        >
          Analyze My Trade
        </Link>

        <div className="absolute -left-10 bottom-0 hidden w-52 rounded-2xl border border-white/10 bg-[#0d2415]/80 p-4 backdrop-blur-xl md:block">
          <p className="text-xs text-white/50">Trades analyzed</p>
          <p className="mt-1 text-2xl font-bold">128</p>
          <p className="mt-1 text-xs font-medium text-emerald-400">+12 this week</p>
        </div>

        <div className="absolute -right-6 bottom-2 hidden w-52 rounded-2xl border border-white/10 bg-[#0d2415]/80 p-4 backdrop-blur-xl md:block">
          <p className="text-xs text-white/50">Rule compliance</p>
          <div className="mt-1 flex items-center gap-1">
            <p className="text-2xl font-bold">82%</p>
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          </div>
          <p className="mt-1 text-xs font-medium text-emerald-400">Top tier this month</p>
        </div>
      </div>

      {/* Guest warning */}
      <div className="relative z-10 mx-auto max-w-2xl px-6 pb-20">
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
      </div>
    </div>
  );
}