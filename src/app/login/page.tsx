"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Force dynamic so middleware runs on every request and nothing gets
// edge-cached. Without this, Next prerenders /login as static and Railway's
// edge serves it for s-maxage=31536000 — middleware never runs, the
// stale-cookie clearing never fires, and the redirect loop comes back.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup fields
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.ok) {
        router.push(data.redirect || "/dashboard");
      } else {
        setError(data.error || "Login failed.");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, companyName }),
      });

      const data = await res.json();

      if (data.ok) {
        router.push(data.redirect || "/setup");
      } else {
        setError(data.error || "Signup failed.");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.08),transparent_70%)] blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.06),transparent_70%)] blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Brand */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-500/25">
              A
            </div>
            <span className="text-2xl font-bold tracking-tight">atib</span>
          </div>
          <p className="text-[var(--color-atib-text-muted)] text-sm">
            PMM Intelligence Platform
          </p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 glow-accent animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
          {/* Tab toggle */}
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-atib-surface)] mb-6">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-[var(--color-atib-accent)] text-white shadow-sm"
                  : "text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)]"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("signup"); setError(""); }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                mode === "signup"
                  ? "bg-[var(--color-atib-accent)] text-white shadow-sm"
                  : "text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)]"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in-up">
              {error}
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="pmm@company.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : null}
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="signup-name" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
                  Your Name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Jane Doe"
                  required
                />
              </div>

              <div>
                <label htmlFor="signup-company" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
                  Company Name
                </label>
                <input
                  id="signup-company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="input-field"
                  placeholder="Acme Corp"
                  required
                />
              </div>

              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="pmm@company.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : null}
                {loading ? "Creating..." : "Create Account & Start Setup"}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[var(--color-atib-text-dim)] mt-6 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
          Sales reps and viewers — check your email for a magic link invitation.
        </p>
      </div>
    </div>
  );
}
