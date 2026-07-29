"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { paymentsApi, usersApi } from "@/lib/api";
import type { CreditTransactionItem, UserProfile } from "@/types";
import {
  Check,
  CreditCard,
  Loader2,
  AlertCircle,
  Coins,
  Receipt,
  Sparkles,
  RefreshCw,
  BookOpenCheck,
  BrainCircuit,
  Wand2,
  AudioWaveform,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ArrowRight,
  CheckCircle2,
  X,
  Feather,
  Rocket,
  Flame,
  HelpCircle,
} from "lucide-react";
import clsx from "clsx";

const PACKAGES = [
  {
    id: "starter" as const,
    name: "Starter Pack",
    credits: 100,
    priceRupees: 49,
    perCredit: "₹0.49",
    popular: false,
    badge: null,
    savings: null,
    icon: Feather,
    cardHover: "hover:border-blue-500/50 hover:shadow-[0_15px_35px_rgba(59,130,246,0.12)]",
    iconBg: "bg-blue-500/10 text-blue-400 border-blue-500/20 group-hover:bg-blue-500/20 group-hover:border-blue-500/40",
    btnStyle: "bg-zinc-800 hover:bg-blue-600 text-zinc-100 hover:text-white border border-zinc-700/50 hover:border-blue-500",
    description: "Great for quick AI summaries, targeted Q&A, and casual note-taking.",
    features: [
      "100 AI Credits added instantly",
      "~20 AI Note Summaries (5 cr each)",
      "~50 Q&A AI Queries (2 cr each)",
      "~10 Voice Transcriptions (10 cr each)",
      "No expiration — credits roll over forever",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro Pack",
    credits: 500,
    priceRupees: 199,
    perCredit: "₹0.39",
    popular: true,
    badge: "MOST POPULAR",
    savings: "SAVE 20%",
    icon: Rocket,
    cardHover: "hover:border-violet-400 hover:shadow-[0_20px_50px_rgba(139,92,246,0.3)] hover:-translate-y-3",
    iconBg: "bg-violet-500/15 text-violet-300 border-violet-500/30 group-hover:bg-violet-500/25 group-hover:border-violet-400",
    btnStyle: "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/25 active:scale-[0.99]",
    description: "Ideal for active students, researchers, and daily note-takers.",
    features: [
      "500 AI Credits added instantly",
      "~100 AI Note Summaries (5 cr each)",
      "~250 Q&A AI Queries (2 cr each)",
      "~50 Voice Transcriptions (10 cr each)",
      "Priority Groq LLM execution queue",
      "No expiration — credits roll over forever",
    ],
  },
  {
    id: "power" as const,
    name: "Power Pack",
    credits: 1500,
    priceRupees: 499,
    perCredit: "₹0.33",
    popular: false,
    badge: "BEST VALUE",
    savings: "SAVE 33%",
    icon: Flame,
    cardHover: "hover:border-amber-500/50 hover:shadow-[0_15px_35px_rgba(245,158,11,0.12)]",
    iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/20 group-hover:bg-amber-500/20 group-hover:border-amber-500/40",
    btnStyle: "bg-zinc-800 hover:bg-amber-600 text-zinc-100 hover:text-white border border-zinc-700/50 hover:border-amber-500",
    description: "For heavy workflows with long documents, audio logs, and deep research.",
    features: [
      "1,500 AI Credits added instantly",
      "~300 AI Note Summaries (5 cr each)",
      "~750 Q&A AI Queries (2 cr each)",
      "~150 Voice Transcriptions (10 cr each)",
      "Top-tier priority LLM processing queue",
      "No expiration — credits roll over forever",
    ],
  },
];

const COST_MATRIX = [
  {
    feature: "Note Summarization",
    icon: BookOpenCheck,
    cost: "5 Credits",
    description: "Generates structured summaries and key takeaways from raw notes.",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-400 group-hover:bg-blue-500/20 group-hover:border-blue-500/40",
  },
  {
    feature: "Q&A Assistant Chat",
    icon: BrainCircuit,
    cost: "2 Credits",
    description: "Answers questions across your workspace notes using context-aware retrieval.",
    color: "bg-purple-500/10 border-purple-500/20 text-purple-400 group-hover:bg-purple-500/20 group-hover:border-purple-500/40",
  },
  {
    feature: "AI Writing Actions",
    icon: Wand2,
    cost: "3 Credits",
    description: "Transforms text tone, expands outlines, or fixes formatting.",
    color: "bg-pink-500/10 border-pink-500/20 text-pink-400 group-hover:bg-pink-500/20 group-hover:border-pink-500/40",
  },
  {
    feature: "Voice Transcription",
    icon: AudioWaveform,
    cost: "10 Credits",
    description: "Transcribes audio recordings into clean text with auto task parsing.",
    color: "bg-amber-500/10 border-amber-500/20 text-amber-400 group-hover:bg-amber-500/20 group-hover:border-amber-500/40",
  },
  {
    feature: "Task Extraction",
    icon: CalendarCheck,
    cost: "3 Credits",
    description: "Parses action items, deadlines, and dates into calendar tasks.",
    color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/40",
  },
];

const FAQS = [
  {
    id: "faq-expire",
    question: "Do purchased credits ever expire?",
    answer: "No. All credit purchases are one-time transactions and your balance never expires. You can use your credits whenever you need them.",
  },
  {
    id: "faq-methods",
    question: "Which payment methods are supported?",
    answer: "We support UPI (Google Pay, PhonePe, Paytm, BHIM), Credit & Debit Cards (Visa, Mastercard, RuPay), Net Banking across major banks, and Wallets via Razorpay.",
  },
  {
    id: "faq-failed",
    question: "What happens if an AI request fails?",
    answer: "If an AI call encounters an error or network drop, your credit balance is automatically preserved and zero credits are deducted.",
  },
  {
    id: "faq-subscriptions",
    question: "Are there any monthly subscription fees?",
    answer: "None. Luminote uses a pure pay-as-you-go credit system. You are never billed automatically or forced into monthly recurring plans.",
  },
];

export default function PricingPage() {
  const { user, isLoaded } = useUser();
  const [mounted, setMounted] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<CreditTransactionItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>("faq-expire");

  // Calculator State
  const [summariesCount, setSummariesCount] = useState(15);
  const [qaCount, setQaCount] = useState(40);
  const [audioCount, setAudioCount] = useState(5);

  const estimatedCredits = summariesCount * 5 + qaCount * 2 + audioCount * 10;
  const recommendedPack =
    estimatedCredits <= 100 ? PACKAGES[0] : estimatedCredits <= 500 ? PACKAGES[1] : PACKAGES[2];

  // Load Razorpay script
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if ((window as any).Razorpay) return;

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const fetchData = async () => {
    try {
      const userRes = await usersApi.getMe();
      setUserProfile(userRes.data);
    } catch {
      // User might be logged out
    }

    try {
      setLoadingHistory(true);
      const historyRes = await paymentsApi.getHistory();
      setTransactions(historyRes.data);
    } catch {
      // silent catch
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (mounted && isLoaded) {
      fetchData();
    }
  }, [mounted, isLoaded]);

  if (!mounted) return null;

  const handleCheckout = async (packageId: "starter" | "pro" | "power") => {
    setLoadingPkg(packageId);
    setError(null);
    setSuccessMessage(null);

    const pkg = PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return;

    try {
      const res = await paymentsApi.createOrder(packageId);
      const { order_id, amount, currency, razorpay_key_id } = res.data;

      const options = {
        key: razorpay_key_id,
        amount: amount,
        currency: currency,
        name: "Luminote AI",
        description: `${pkg.name} — ${pkg.credits} Credits`,
        image: "/webLogo.png",
        order_id: order_id,
        handler: async function (response: any) {
          try {
            setLoadingPkg(packageId);
            const verifyRes = await paymentsApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            const newBalance = verifyRes.data.credit_balance;
            setSuccessMessage(
              `Payment successful! Added ${pkg.credits} credits. Balance updated to ${newBalance} credits.`
            );
            if (userProfile) {
              setUserProfile({ ...userProfile, credit_balance: newBalance });
            }
            fetchData();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("luminote:refresh_credits"));
            }
          } catch (err: any) {
            setError(
              err.response?.data?.detail || "Payment verification failed. Please try again."
            );
          } finally {
            setLoadingPkg(null);
          }
        },
        prefill: {
          name: user?.fullName || user?.username || "",
          email: user?.primaryEmailAddress?.emailAddress || "",
        },
        notes: {
          package: packageId,
        },
        theme: {
          color: "#8b5cf6",
          backdrop_color: "rgba(9, 9, 11, 0.9)",
        },
        modal: {
          ondismiss: function () {
            setLoadingPkg(null);
          },
        },
      };

      if ((window as any).Razorpay) {
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", function (response: any) {
          setError(`Payment process was cancelled.`);
          setLoadingPkg(null);
        });
        rzp.open();
      } else {
        setError("Payment gateway SDK failed to load. Please refresh.");
        setLoadingPkg(null);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Failed to create order. Please check backend config."
      );
      setLoadingPkg(null);
    }
  };

  return (
    <div className="min-h-screen pb-20 pt-6 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto font-sans antialiased text-zinc-100 animate-fade-in">
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="text-center max-w-3xl mx-auto mb-14">
        <h1 className="group cursor-default text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-4 transition-all duration-500">
          <span className="inline-block transition-all duration-500 group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-violet-300 group-hover:to-indigo-200 group-hover:bg-clip-text group-hover:text-transparent group-hover:scale-[1.01]">
            Simple pricing.
          </span>{" "}
          <span className="inline-block transition-all duration-500 group-hover:bg-gradient-to-r group-hover:from-violet-300 group-hover:via-purple-300 group-hover:to-pink-300 group-hover:bg-clip-text group-hover:text-transparent group-hover:scale-[1.01]">
            No subscriptions.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-zinc-400 font-normal leading-relaxed">
          Buy credit top-ups whenever you need them. Credits never expire and roll over automatically.
        </p>

        {/* User Balance Widget */}
        {userProfile && (
          <div className="mt-6 inline-flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-900/90 border border-zinc-800 backdrop-blur-md hover:border-violet-500/50 hover:bg-zinc-900 transition-all duration-300 shadow-lg shadow-black/20 group/balance">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Coins className="w-4 h-4 text-violet-400 group-hover/balance:rotate-12 transition-transform" />
            <span className="text-xs font-medium text-zinc-400">Current Balance:</span>
            <span className="text-sm font-bold text-white tracking-tight">{userProfile.credit_balance} Credits</span>
          </div>
        )}
      </header>

      {/* ── ALERTS ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── PRICING CARDS WITH HOVER EFFECTS & UNIQUE ICONS ────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
        {PACKAGES.map((pkg) => {
          const isLoading = loadingPkg === pkg.id;
          const Icon = pkg.icon;

          return (
            <div
              key={pkg.id}
              className={clsx(
                "group relative flex flex-col justify-between p-7 sm:p-8 rounded-2xl border transition-all duration-300 hover:-translate-y-2 cursor-pointer backdrop-blur-sm",
                pkg.popular
                  ? "bg-gradient-to-b from-zinc-900/90 via-purple-950/20 to-zinc-900/90 border-violet-500/80 shadow-[0_0_35px_rgba(139,92,246,0.15)] md:-translate-y-2"
                  : "bg-zinc-950/60 border-zinc-800",
                pkg.cardHover
              )}
            >
              {/* Popular Badge */}
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md">
                    {pkg.badge}
                  </span>
                </div>
              )}

              <div>
                {/* Header & Unique Icon */}
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={clsx(
                      "w-10 h-10 rounded-xl border flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
                      pkg.iconBg
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {pkg.savings && (
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {pkg.savings}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-bold text-white mb-1 group-hover:text-violet-300 transition-colors">
                  {pkg.name}
                </h3>

                <p className="text-xs text-zinc-400 mb-6 leading-relaxed min-h-[36px]">
                  {pkg.description}
                </p>

                {/* Price */}
                <div className="flex items-baseline gap-1.5 mb-6 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 group-hover:border-zinc-700/80 transition-colors">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                    ₹{pkg.priceRupees}
                  </span>
                  <span className="text-xs text-zinc-500">one-time</span>
                  <span className="ml-auto text-xs font-bold text-violet-400">
                    {pkg.credits} Credits
                  </span>
                </div>

                {/* Feature List */}
                <div className="space-y-3 pt-4 border-t border-zinc-800/80 mb-8">
                  {pkg.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5 text-xs text-zinc-300">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 stroke-[2.5]" />
                      <span className="leading-normal">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action CTA */}
              <button
                type="button"
                onClick={() => handleCheckout(pkg.id)}
                disabled={!!loadingPkg}
                className={clsx(
                  "w-full py-3.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer group/btn",
                  pkg.btnStyle
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Buy {pkg.name} — ₹{pkg.priceRupees}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── INTERACTIVE CREDIT ESTIMATOR ─────────────────────────────────── */}
      <section className="mb-20 p-6 sm:p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-colors">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">Credit Estimator</h2>
            <p className="text-xs text-zinc-400">Estimate how many credits you need based on your monthly workflow.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Slider 1: Summaries */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
            <div className="flex justify-between text-xs font-medium mb-2">
              <span className="text-zinc-300 flex items-center gap-1.5">
                <BookOpenCheck className="w-3.5 h-3.5 text-blue-400" /> Note Summaries
              </span>
              <span className="text-violet-400 font-bold">{summariesCount} notes/mo</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={summariesCount}
              onChange={(e) => setSummariesCount(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <span className="text-[10px] text-zinc-500 mt-1 block">5 credits per summary</span>
          </div>

          {/* Slider 2: Q&A Queries */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
            <div className="flex justify-between text-xs font-medium mb-2">
              <span className="text-zinc-300 flex items-center gap-1.5">
                <BrainCircuit className="w-3.5 h-3.5 text-purple-400" /> Q&A Chat Queries
              </span>
              <span className="text-violet-400 font-bold">{qaCount} queries/mo</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={qaCount}
              onChange={(e) => setQaCount(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <span className="text-[10px] text-zinc-500 mt-1 block">2 credits per query</span>
          </div>

          {/* Slider 3: Audio Transcriptions */}
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition-colors">
            <div className="flex justify-between text-xs font-medium mb-2">
              <span className="text-zinc-300 flex items-center gap-1.5">
                <AudioWaveform className="w-3.5 h-3.5 text-amber-400" /> Voice Transcriptions
              </span>
              <span className="text-violet-400 font-bold">{audioCount} recordings/mo</span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              value={audioCount}
              onChange={(e) => setAudioCount(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer"
            />
            <span className="text-[10px] text-zinc-500 mt-1 block">10 credits per recording</span>
          </div>
        </div>

        {/* Calculation Summary Bar */}
        <div className="p-4 rounded-xl bg-violet-600/10 border border-violet-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <span className="text-xs text-zinc-400 block">Estimated Monthly Requirement</span>
            <span className="text-xl font-black text-white">~{estimatedCredits} Credits / month</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-300">Recommended Pack:</span>
            <button
              type="button"
              onClick={() => handleCheckout(recommendedPack.id)}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer group"
            >
              <span>{recommendedPack.name} (₹{recommendedPack.priceRupees})</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* ── FEATURE COST SCHEDULE WITH UNIQUE ICONS & HOVER ─────────────── */}
      <section className="mb-20 p-6 sm:p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <h2 className="text-base sm:text-lg font-bold text-white mb-2">Feature Credit Rates</h2>
        <p className="text-xs text-zinc-400 mb-6">Exact credit costs per invocation across the platform.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {COST_MATRIX.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.feature}
                className="group p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition-all duration-300 hover:-translate-y-1"
              >
                <div
                  className={clsx(
                    "w-9 h-9 rounded-lg border flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110",
                    item.color
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-white mb-1 group-hover:text-violet-300 transition-colors">
                  {item.feature}
                </h3>
                <span className="text-xs font-semibold text-violet-400 block mb-2">{item.cost}</span>
                <p className="text-[11px] text-zinc-400 leading-tight">{item.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── TRANSACTION HISTORY LEDGER ────────────────────────────────────── */}
      {transactions.length > 0 && (
        <section className="mb-20 p-6 sm:p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <Receipt className="w-5 h-5 text-violet-400" />
              <h2 className="text-base sm:text-lg font-bold text-white">Credit History</h2>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="p-2 text-zinc-400 hover:text-white rounded-lg bg-zinc-800 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={clsx("w-3.5 h-3.5", loadingHistory && "animate-spin")} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950 text-zinc-400 font-semibold uppercase tracking-wider border-b border-zinc-800">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4">Credits</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {transactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <tr key={tx.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4 text-zinc-400 font-medium">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString() : "Recent"}
                      </td>
                      <td className="py-3 px-4 capitalize font-semibold text-zinc-300">
                        {tx.type}
                      </td>
                      <td className="py-3 px-4 text-zinc-200 capitalize">
                        {tx.feature || (tx.type === "purchase" ? "Credit Pack Top-up" : "AI Usage")}
                      </td>
                      <td
                        className={clsx(
                          "py-3 px-4 font-bold",
                          isPositive ? "text-emerald-400" : "text-zinc-300"
                        )}
                      >
                        {isPositive ? `+${tx.amount}` : tx.amount}
                      </td>
                      <td className="py-3 px-4 text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Completed
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── FREQUENTLY ASKED QUESTIONS ACCORDION ─────────────────────────── */}
      <section className="p-6 sm:p-8 rounded-2xl bg-zinc-900/60 border border-zinc-800">
        <div className="flex items-center gap-2.5 mb-6">
          <HelpCircle className="w-5 h-5 text-violet-400" />
          <h2 className="text-base sm:text-lg font-bold text-white">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq) => {
            const isOpen = expandedFaq === faq.id;

            return (
              <div
                key={faq.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 overflow-hidden transition-colors hover:border-zinc-700/80"
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isOpen ? null : faq.id)}
                  className="w-full p-4 flex items-center justify-between text-left font-semibold text-xs sm:text-sm text-zinc-200 hover:text-white transition-colors"
                >
                  <span>{faq.question}</span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-violet-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-zinc-400 leading-relaxed border-t border-zinc-800/50 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
