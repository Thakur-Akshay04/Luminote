"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import { Sparkles, Mail, Lock, Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.register(email, password);
      setAuth(res.data.access_token, {
        user_id: res.data.user_id,
        email: res.data.email,
      });
      router.push("/notes");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Registration failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength =
    password.length === 0 ? null :
    password.length < 8 ? "weak" :
    password.length < 12 ? "medium" : "strong";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm">
            <Sparkles className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-2xl font-bold text-gradient">Create account</h1>
          <p className="text-gray-500 text-sm mt-1">Start taking smarter notes today</p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-6 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-gray-400">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="email"
                type="email"
                className="input pl-10"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-gray-400">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                id="password"
                type="password"
                className="input pl-10"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            {/* Strength indicator */}
            {passwordStrength && (
              <div className="flex gap-1 mt-1">
                {["weak", "medium", "strong"].map((level, i) => {
                  const active =
                    passwordStrength === "weak" ? i === 0 :
                    passwordStrength === "medium" ? i <= 1 : true;
                  const color =
                    passwordStrength === "weak" ? "bg-red-500" :
                    passwordStrength === "medium" ? "bg-amber-400" : "bg-emerald-500";
                  return (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-all ${active ? color : "bg-surface-600"}`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-xs font-medium text-gray-400">Confirm password</label>
            <div className="relative">
              {confirm && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {confirm === password ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              )}
              <input
                id="confirm"
                type="password"
                className="input"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            id="register-btn"
            type="submit"
            className="btn-primary mt-2"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
