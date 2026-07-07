"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ShieldCheck, Upload, CheckCircle2, AlertTriangle, Lock, Image as ImageIcon, Type, Target, Flag, SlidersHorizontal, ListChecks, Clock, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPreTradeCommitment, lockPreTradeCommitment } from "@/lib/commitment-utils";
import Link from "next/link";

export default function NewCommitmentPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [commitmentId, setCommitmentId] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState<string | null>(null);

  // Form state
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [thesis, setThesis] = useState('');
  const [setupType, setSetupType] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [invalidationReason, setInvalidationReason] = useState('');
  const [confidenceScore, setConfidenceScore] = useState(5);
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [ticker, setTicker] = useState('');

  // Common trading rules
  const tradingRules = [
    { id: 'position_size', label: 'Position size within risk limits' },
    { id: 'setup_validation', label: 'Validated setup pattern' },
    { id: 'catalyst', label: 'Clear catalyst identified' },
    { id: 'volume', label: 'Volume meets criteria' },
    { id: 'trend', label: 'Trades in direction of trend' },
    { id: 'risk_reward', label: 'Favorable risk/reward ratio' },
    { id: 'timeframe', label: 'Correct timeframe for strategy' },
    { id: 'liquidity', label: 'Sufficient liquidity' },
    { id: 'news_check', label: 'No conflicting news/catalysts' },
    { id: 'plan', label: 'Clear entry/exit plan' }
  ];

  // Setup types
  const setupTypes = [
    'Breakout',
    'VWAP reclaim',
    'Momentum',
    'Pullback',
    'Reversal',
    'Mean reversion',
    'Gap and go',
    'Continuation',
    'Other'
  ];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const sessionUser = data.user ?? null;
      setUser(sessionUser);
      setLoading(false);
    });
  }, []);

  async function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setScreenshot(file);
    setScreenshotPreview(URL.createObjectURL(file));

    // Upload to Supabase storage
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `commitments/${Date.now()}_${user?.id}.${fileExt}`;

      const { data, error } = await supabase
        .storage
        .from('trade-screenshots')
        .upload(fileName, file);

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase
        .storage
        .from('trade-screenshots')
        .getPublicUrl(fileName);

      setScreenshotUrl(urlData.publicUrl);
    } catch (error) {
      console.error('Screenshot upload error:', error);
    }
  }

  async function handleSaveCommitment() {
    if (!user) return;

    try {
      setSaving(true);

      const commitmentData = {
        screenshot_url: screenshotUrl,
        thesis,
        setup_type: setupType,
        expected_outcome: expectedOutcome,
        invalidation_reason: invalidationReason,
        confidence_score: confidenceScore,
        selected_rules: selectedRules,
        ticker: ticker.toUpperCase()
      };

      const commitment = await createPreTradeCommitment(user.id, commitmentData);
      setCommitmentId(commitment.id);
      setIsLocked(false);

      return commitment;
    } catch (error) {
      console.error('Save commitment error:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function handleLockCommitment() {
    if (!commitmentId) return;

    try {
      setLocking(true);
      const commitment = await lockPreTradeCommitment(commitmentId);
      setIsLocked(true);
      setLockedAt(new Date().toLocaleString());
      return commitment;
    } catch (error) {
      console.error('Lock commitment error:', error);
      throw error;
    } finally {
      setLocking(false);
    }
  }

  async function handleSaveAndLock() {
    try {
      await handleSaveCommitment();
      await handleLockCommitment();
      router.push('/dashboard');
    } catch (error) {
      console.error('Save and lock error:', error);
    }
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
        <p className="text-white/50">You need to be logged in to create commitments.</p>
        <Link
          href="/login"
          className="rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-white" style={bgStyle}>
      {/* Background orbs - matching Baywater style */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[8%] h-[500px] w-[500px] rounded-full bg-blue-500 opacity-20 blur-[120px]" />
        <div className="absolute -bottom-48 right-[8%] h-[500px] w-[500px] rounded-full bg-purple-500 opacity-20 blur-[140px]" />
        <div className="absolute top-[28%] left-[42%] h-[400px] w-[400px] rounded-full bg-cyan-500 opacity-10 blur-[160px]" />
      </div>

      <div className="mx-auto max-w-3xl space-y-6 px-6 pb-20 pt-6">
        {/* PAGE HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pre-Trade Commitment</h1>
            <p className="text-white/60 mt-1">
              Document your trading plan before execution
            </p>
          </div>
          <div className="text-right text-sm text-white/60">
            <p>Baywater is not investment advice.</p>
            <p className="text-xs">AI analysis is based on your historical trading data.</p>
          </div>
        </div>

        {/* COMMITMENT FORM */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Trade Plan
            </CardTitle>
            <p className="text-xs text-white/50 mt-1">
              Create your commitment before entering the trade
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* TICKER */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-white/60" />
                Ticker
              </label>
              <Input
                type="text"
                placeholder="AAPL, TSLA, NVDA, etc."
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30"
              />
              <p className="text-xs text-white/60">
                The stock you're planning to trade
              </p>
            </div>

            {/* SCREENSHOT UPLOAD */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-white/60" />
                Chart Screenshot
              </label>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">
                  <Upload className="h-4 w-4" />
                  Upload Screenshot
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshotUpload}
                    className="hidden"
                  />
                </label>
                {screenshotPreview && (
                  <div className="text-sm text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Screenshot uploaded
                  </div>
                )}
              </div>
              <p className="text-xs text-white/60">
                Upload the chart that shows your setup (optional but recommended)
              </p>
            </div>

            {/* TRADE THESIS */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Type className="h-4 w-4 text-white/60" />
                Trade Thesis <span className="text-red-400">*</span>
              </label>
              <textarea
                placeholder="Why are you taking this trade? Be specific about the setup."
                value={thesis}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setThesis(e.target.value)}
                className="min-h-[100px] w-full border border-white/10 bg-white/5 p-3 text-white placeholder:text-white/30 rounded-lg"
                required
              />
              <p className="text-xs text-white/60">
                Example: "Breaking previous resistance with increasing volume after earnings catalyst"
              </p>
            </div>

            {/* SETUP TYPE */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-white/60" />
                Setup Type <span className="text-red-400">*</span>
              </label>
              <select
                value={setupType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSetupType(e.target.value)}
                className="w-full border border-white/10 bg-white/5 p-3 text-white rounded-lg"
                required
              >
                <option value="" disabled>Select setup type</option>
                {setupTypes.map((type) => (
                  <option key={type} value={type} className="bg-[#0a1a0f]">
                    {type}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/60">
                What type of trading setup are you using?
              </p>
            </div>

            {/* EXPECTED OUTCOME */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-white/60" />
                Expected Outcome <span className="text-red-400">*</span>
              </label>
              <textarea
                placeholder="What needs to happen for this trade idea to work?"
                value={expectedOutcome}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setExpectedOutcome(e.target.value)}
                className="min-h-[80px] w-full border border-white/10 bg-white/5 p-3 text-white placeholder:text-white/30 rounded-lg"
                required
              />
              <p className="text-xs text-white/60">
                Example: "Volume continues to expand as price breaks above $150 resistance level"
              </p>
            </div>

            {/* INVALIDATION REASON */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Flag className="h-4 w-4 text-white/60" />
                Invalidation Reason <span className="text-red-400">*</span>
              </label>
              <textarea
                placeholder="Where is your invalidation point and why?"
                value={invalidationReason}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInvalidationReason(e.target.value)}
                className="min-h-[80px] w-full border border-white/10 bg-white/5 p-3 text-white placeholder:text-white/30 rounded-lg"
                required
              />
              <p className="text-xs text-white/60">
                Example: "Stop loss at $148 if price fails to hold above moving average"
              </p>
            </div>

            {/* CONFIDENCE SCORE */}
            <div className="space-y-4">
              <label className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-white/60" />
                Confidence Level <span className="text-red-400">*</span>
              </label>
              <div className="space-y-3">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={confidenceScore}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setConfidenceScore(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-sm">
                  <span>1 (Low)</span>
                  <span className="font-medium">{confidenceScore}</span>
                  <span>10 (High)</span>
                </div>
              </div>
              <p className="text-xs text-white/60">
                How confident are you in this setup? (1 = guessing, 10 = very high conviction)
              </p>
            </div>

            {/* RULE CHECKLIST */}
            <div className="space-y-3">
              <label className="text-sm font-medium flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-white/60" />
                Rule Checklist
              </label>
              <p className="text-xs text-white/60">
                Select which of your trading rules this trade satisfies:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tradingRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={rule.id}
                      checked={selectedRules.includes(rule.id)}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        if (e.target.checked) {
                          setSelectedRules([...selectedRules, rule.id]);
                        } else {
                          setSelectedRules(selectedRules.filter(r => r !== rule.id));
                        }
                      }}
                      className="h-4 w-4 border border-white/20 rounded bg-transparent checked:bg-emerald-500 checked:border-emerald-500"
                    />
                    <label htmlFor={rule.id} className="text-sm cursor-pointer">
                      {rule.label}
                    </label>
                  </div>
                ))}
              </div>
              {selectedRules.length === 0 && (
                <p className="text-xs text-amber-400 mt-2">
                  ⚠️ No rules selected - this may indicate a violation of your trading plan
                </p>
              )}
            </div>

            {/* DISCLAIMER */}
            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300">
                  <strong>Important:</strong> Baywater is not investment advice. This commitment system is designed to help you follow your own trading rules and analyze your process quality. The AI analysis is based solely on your historical trading data and is intended for journaling and self-reflection only.
                </p>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6">
              {commitmentId && !isLocked ? (
                <Button
                  onClick={handleLockCommitment}
                  disabled={locking || !thesis || !setupType || !expectedOutcome || !invalidationReason}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400"
                >
                  {locking ? (
                    <>
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                      Locking...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Lock Commitment
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleSaveCommitment}
                  disabled={saving || !thesis || !setupType || !expectedOutcome || !invalidationReason}
                  className="flex-1 bg-indigo-500 hover:bg-indigo-400"
                >
                  {saving ? (
                    <>
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Save Commitment
                    </>
                  )}
                </Button>
              )}

              {isLocked ? (
                <Button
                  onClick={handleSaveAndLock}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Complete & Go to Dashboard
                </Button>
              ) : (
                <Link
                  href="/dashboard"
                  className="flex-1 text-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Cancel
                </Link>
              )}
            </div>

            {/* LOCKED STATUS */}
            {isLocked && (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 mt-6">
                <div className="flex items-center gap-3">
                  <Lock className="h-6 w-6 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-emerald-300">Commitment Locked</p>
                    <p className="text-sm text-emerald-200 mt-1">
                      Your trading plan has been locked at {lockedAt}. This commitment cannot be edited.
                    </p>
                    <p className="text-xs text-emerald-100 mt-2">
                      After you execute this trade, Baywater will compare your actual execution with this original plan.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* HOW IT WORKS */}
        <Card className="border border-white/10 bg-white/5 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-400" />
              How This Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="h-6 w-6 flex-shrink-0 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">1</span>
              <div>
                <p className="font-medium">Create Your Commitment</p>
                <p className="text-sm text-white/80 mt-1">
                  Document your trading plan <strong>before</strong> entering the trade. Be specific about your thesis, setup, and rules.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="h-6 w-6 flex-shrink-0 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">2</span>
              <div>
                <p className="font-medium">Lock Your Plan</p>
                <p className="text-sm text-white/80 mt-1">
                  Once locked, your commitment cannot be edited. This creates accountability and prevents hindsight bias.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="h-6 w-6 flex-shrink-0 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">3</span>
              <div>
                <p className="font-medium">Execute Your Trade</p>
                <p className="text-sm text-white/80 mt-1">
                  Trade as normal. Baywater will automatically match your trade to this commitment.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="h-6 w-6 flex-shrink-0 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center">4</span>
              <div>
                <p className="font-medium">Get Process Analysis</p>
                <p className="text-sm text-white/80 mt-1">
                  After your trade completes, Baywater will show you how well your actual execution matched your original plan.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/5 border border-white/10 mt-4">
              <p className="text-sm font-medium text-white/90">Why This Matters</p>
              <p className="text-sm text-white/80 mt-2">
                Most traders rewrite history after the fact, justifying bad trades that happened to work out.
                Baywater's commitment system helps you <strong>stop rewriting history</strong> and see what you
                actually believed when you clicked buy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}