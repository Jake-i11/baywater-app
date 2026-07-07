"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown, Upload, ArrowRight } from "lucide-react";
import { completeOnboarding } from "@/lib/profile-utils";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check authentication and user data
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login");
      } else {
        setUser(data.user);
        setLoading(false);
      }
    });
  }, [router]);

  async function handleCompleteOnboarding() {
    try {
      if (user) {
        await completeOnboarding(user.id);
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      router.push("/dashboard");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070d] text-white">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
          <span>Preparing your onboarding...</span>
        </div>
      </div>
    );
  }

  // Shared background style matching Baywater's dark glassmorphism
  const bgStyle = {
    background: 'linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)',
    backgroundImage: `
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(135deg, #0a1a0f 0%, #07120a 40%, #0c1f14 100%)
    `,
    backgroundSize: '40px 40px, 40px 40px, 100% 100%',
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-white" style={bgStyle}>
      {/* Background orbs - matching Baywater style */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-blue-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-purple-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-cyan-500 opacity-10 blur-[160px]" />
      </div>

      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <span className="font-semibold">Baywater</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">Step {step} of 5</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`h-2 w-2 rounded-full ${s === step ? 'bg-emerald-400' : s < step ? 'bg-emerald-500/60' : 'bg-white/20'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Onboarding content */}
        <div className="space-y-8">
          {/* Step 1: Process over outcome */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <span className="text-white font-bold">1</span>
                </span>
                <h2 className="text-2xl font-bold">Stop judging trades by profit alone.</h2>
              </div>

              <div className="space-y-4">
                <p className="text-white/80">
                  Most trading journals tell you if you won or lost.
                </p>
                <p className="text-white/60">
                  Baywater analyzes whether your decision-making process was good, even when the outcome was lucky or unlucky.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium">Good process, bad outcome</p>
                    <p className="text-sm text-white/60 mt-1">
                      A losing trade where you followed all your rules is still a good trade.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 mt-4">
                  <div className="flex-shrink-0">
                    <XCircle className="h-6 w-6 text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium">Bad process, good outcome</p>
                    <p className="text-sm text-white/60 mt-1">
                      A winning trade where you broke your rules is still a bad trade.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full rounded-full bg-emerald-500 py-3 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition"
              >
                Continue <ArrowRight className="inline ml-2 h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Discipline Score */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center">
                  <span className="text-white font-bold">2</span>
                </span>
                <h2 className="text-2xl font-bold">Your process gets a score.</h2>
              </div>

              <div className="space-y-4">
                <p className="text-white/80">
                  Every trade receives a discipline score based on whether you followed your own rules.
                </p>
                <p className="text-white/60">
                  A profitable trade with bad discipline is still a bad trade.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="text-center">
                  <div className="relative mx-auto mb-4 h-32 w-32">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="8" strokeDasharray="251" strokeDashoffset="75" />
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#064e3b" strokeWidth="8" strokeDasharray="251" strokeDashoffset="75" strokeOpacity="0.3" />
                      <text x="50" y="55" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">78</text>
                      <text x="50" y="70" textAnchor="middle" fill="#a7f3d0" fontSize="10">/ 100</text>
                    </svg>
                  </div>
                  <p className="font-medium">Discipline Score: 78/100</p>
                  <p className="text-sm text-white/60 mt-1">Good execution, but position size rule was violated</p>
                </div>
              </div>

              <div className="flex justify-between gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold hover:bg-white/10"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                >
                  Continue <ArrowRight className="inline ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Dangerous Wins */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center">
                  <span className="text-white font-bold">3</span>
                </span>
                <h2 className="text-2xl font-bold">Some wins are actually losses in disguise.</h2>
              </div>

              <div className="space-y-4">
                <p className="text-white/80">
                  Baywater identifies trades where you broke your rules but happened to make money.
                </p>
                <p className="text-white/60">
                  These are dangerous wins because they reinforce bad habits.
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-8 w-8 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-amber-300">+$800</span>
                      <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-300">Winner</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-300">Process Failed</span>
                    </div>
                    <p className="text-sm text-amber-200 mt-3 font-medium">Dangerous Win</p>
                    <p className="text-xs text-amber-100 mt-1">
                      This trade violated your position sizing rule but was profitable. Dangerous wins reinforce bad habits.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between gap-4">
                <button
                  onClick={() => setStep(2)}
                  className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold hover:bg-white/10"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                >
                  Continue <ArrowRight className="inline ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Violation Cost */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                  <span className="text-white font-bold">4</span>
                </span>
                <h2 className="text-2xl font-bold">See exactly what bad habits cost you.</h2>
              </div>

              <div className="space-y-4">
                <p className="text-white/80">
                  Baywater calculates the dollar impact of breaking your rules.
                </p>
                <p className="text-white/60">
                  Not just how many mistakes you made. How much those mistakes cost.
                </p>
              </div>

              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                <div className="text-center">
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-red-300">$4,230</span>
                    <p className="text-sm text-red-200 mt-1">Money lost from rule violations this month</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-left">
                      <p className="font-medium text-red-300">12 violations</p>
                      <p className="text-red-200">Total rule breaks</p>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-red-300">$1,840</p>
                      <p className="text-red-200">Most expensive violation</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between gap-4">
                <button
                  onClick={() => setStep(3)}
                  className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold hover:bg-white/10"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                >
                  Continue <ArrowRight className="inline ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Upload CTA */}
          {step === 5 && (
            <div className="space-y-6 text-center">
              <div className="flex items-center justify-center gap-3">
                <span className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
                  <span className="text-white font-bold">5</span>
                </span>
                <h2 className="text-2xl font-bold">Find your real trading edge.</h2>
              </div>

              <div className="space-y-4">
                <p className="text-white/80">
                  Upload your trades and Baywater will analyze your execution, discipline, and patterns.
                </p>
                <p className="text-white/60">
                  Discover what you're actually good at, not just what made money.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <ShieldCheck className="h-6 w-6 text-emerald-400" />
                    <span className="font-medium">Process Analysis</span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <TrendingUp className="h-6 w-6 text-emerald-400" />
                    <span className="font-medium">Discipline Scoring</span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                    <span className="font-medium">Dangerous Win Detection</span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <XCircle className="h-6 w-6 text-red-400" />
                    <span className="font-medium">Violation Cost Tracking</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleCompleteOnboarding}
                  className="w-full rounded-full bg-emerald-500 py-3 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition"
                >
                  <Upload className="inline mr-2 h-4 w-4" />
                  Upload My First Trades
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-full text-sm text-white/60 hover:text-white/80"
                >
                  Explore Dashboard First
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}