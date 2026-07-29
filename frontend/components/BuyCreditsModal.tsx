"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { paymentsApi } from "@/lib/api";
import {
  Zap,
  X,
  Check,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Loader2,
  AlertCircle,
  Clock,
  Coins,
} from "lucide-react";
import clsx from "clsx";

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
  initialMessage?: string;
}

const PACKAGES = [
  {
    id: "starter" as const,
    name: "Starter Pack",
    credits: 100,
    priceRupees: 49,
    popular: false,
    badge: "Great for quick tasks",
    features: [
      "20 Note Summaries",
      "50 Q&A Queries",
      "10 Voice Transcriptions",
      "Instant Delivery",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro Pack",
    credits: 500,
    priceRupees: 199,
    popular: true,
    badge: "MOST POPULAR",
    features: [
      "100 Note Summaries",
      "250 Q&A Queries",
      "50 Voice Transcriptions",
      "Priority AI Response Time",
      "Never Expire",
    ],
  },
  {
    id: "power" as const,
    name: "Power Pack",
    credits: 1500,
    priceRupees: 499,
    popular: false,
    badge: "Best Value (3x Credits)",
    features: [
      "300 Note Summaries",
      "750 Q&A Queries",
      "150 Voice Transcriptions",
      "Priority Groq LLM Processing",
      "Dedicated Support",
    ],
  },
];

export default function BuyCreditsModal({
  isOpen,
  onClose,
  onSuccess,
  initialMessage,
}: Readonly<BuyCreditsModalProps>) {
  const { user } = useUser();
  const [selectedPackage, setSelectedPackage] = useState<"starter" | "pro" | "power">("pro");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load Razorpay Checkout.js script dynamically if not present
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).Razorpay) return;

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // keep script loaded for quick reopen
    };
  }, []);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const pkg = PACKAGES.find((p) => p.id === selectedPackage);
    if (!pkg) return;

    try {
      // 1. Create Razorpay order on backend
      const res = await paymentsApi.createOrder(selectedPackage);
      const { order_id, amount, currency, razorpay_key_id } = res.data;

      // 2. Configure Razorpay checkout popup options
      const options = {
        key: razorpay_key_id,
        amount: amount,
        currency: currency,
        name: "Luminote AI Credits",
        description: `${pkg.name} — ${pkg.credits} Credits`,
        image: "/webLogo.png",
        order_id: order_id,
        handler: async function (response: any) {
          try {
            setLoading(true);
            // 3. Verify signature server-side
            const verifyRes = await paymentsApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            const newBalance = verifyRes.data.credit_balance;
            setSuccessMessage(`Success! Added ${pkg.credits} credits. New balance: ${newBalance}`);
            if (onSuccess) {
              onSuccess(newBalance);
            }
            setTimeout(() => {
              onClose();
              setSuccessMessage(null);
            }, 2000);
          } catch (err: any) {
            setError(
              err.response?.data?.detail || "Payment verification failed. Please contact support."
            );
          } finally {
            setLoading(false);
          }
        },
        prefill: {
          name: user?.fullName || user?.username || "",
          email: user?.primaryEmailAddress?.emailAddress || "",
        },
        notes: {
          package: selectedPackage,
        },
        theme: {
          color: "#6366f1",
          backdrop_color: "rgba(0, 0, 0, 0.8)",
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      };

      if ((window as any).Razorpay) {
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", function (response: any) {
          setError(`Payment failed: ${response.error?.description || "Transaction cancelled"}`);
          setLoading(false);
        });
        rzp.open();
      } else {
        setError("Razorpay SDK failed to load. Please check your internet connection and retry.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Failed to initiate payment. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0f0f12] border border-white/[0.1] rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(99,102,241,0.15)] flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Glow Top Highlight */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-brand-500 to-transparent blur-[1px]" />

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Zap className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Top Up AI Credits
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Unlock instant AI summarization, Q&A, voice transcription & smart actions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-full bg-white/[0.03] hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Initial Error/Message Banner */}
        {initialMessage && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{initialMessage}</span>
          </div>
        )}

        {/* Dynamic Error / Success Banners */}
        {error && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold animate-scale-in">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Package Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PACKAGES.map((pkg) => {
            const isSelected = selectedPackage === pkg.id;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => setSelectedPackage(pkg.id)}
                className={clsx(
                  "relative flex flex-col justify-between p-5 rounded-2xl border text-left transition-all duration-300 group cursor-pointer",
                  isSelected
                    ? "bg-gradient-to-b from-brand-600/20 via-brand-600/10 to-transparent border-brand-500 shadow-[0_0_30px_rgba(99,102,241,0.2)] scale-[1.02]"
                    : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.04]"
                )}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-brand-500 to-indigo-500 text-[9px] font-black text-white uppercase tracking-wider shadow-md">
                    {pkg.badge}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                      {pkg.name}
                    </span>
                    <div
                      className={clsx(
                        "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-brand-500 border-brand-400 text-white"
                          : "border-neutral-700 bg-neutral-900"
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1 my-2">
                    <span className="text-3xl sm:text-4xl font-extrabold text-white">
                      ₹{pkg.priceRupees}
                    </span>
                    <span className="text-xs text-neutral-500 font-medium">/ one-time</span>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-bold my-2">
                    <Coins className="w-3.5 h-3.5" />
                    <span>{pkg.credits} Credits</span>
                  </div>

                  <ul className="space-y-1.5 mt-4 text-[11px] text-neutral-400">
                    {pkg.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-1.5">
                        <Check className="w-3 h-3 text-brand-400 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>

        {/* Feature Cost Reference Table */}
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs space-y-2">
          <div className="flex items-center justify-between text-neutral-400 font-semibold border-b border-white/[0.05] pb-1.5">
            <span>AI Feature Cost Breakdown</span>
            <span>Credits per Call</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-neutral-300">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span>Summarize: <strong>5 cr</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>Q&A Chat: <strong>2 cr</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>Writing: <strong>3 cr</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
              <span>Transcription: <strong>10 cr</strong></span>
            </div>
          </div>
        </div>

        {/* Action Button & Security Footer */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-extrabold text-sm sm:text-base tracking-wide flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(99,102,241,0.3)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing Order...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                <span>Pay ₹{PACKAGES.find((p) => p.id === selectedPackage)?.priceRupees} via Razorpay</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Secured by 256-bit SSL & Razorpay PCI-DSS
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-brand-400" />
              Credits Added Instantly
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
