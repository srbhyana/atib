"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError("No invite token found. Please check your invite link.");
      return;
    }

    async function acceptInvite() {
      try {
        const res = await fetch("/api/auth/accept-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (data.ok) {
          setStatus("success");
          setTimeout(() => {
            router.push(data.redirect || "/capture");
          }, 1500);
        } else {
          setStatus("error");
          setError(data.error || "Failed to accept invite.");
        }
      } catch {
        setStatus("error");
        setError("Connection failed. Please try again.");
      }
    }

    acceptInvite();
  }, [searchParams, router]);

  return (
    <div className="glass-card p-8 w-full max-w-sm text-center glow-accent">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
        A
      </div>

      {status === "loading" && (
        <div className="animate-fade-in-up">
          <span className="inline-block w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-3" />
          <p className="text-[var(--color-atib-text-muted)]">Setting up your account...</p>
        </div>
      )}

      {status === "success" && (
        <div className="animate-fade-in-up">
          <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-medium mb-1">You&apos;re in!</p>
          <p className="text-sm text-[var(--color-atib-text-muted)]">Redirecting to your dashboard...</p>
        </div>
      )}

      {status === "error" && (
        <div className="animate-fade-in-up">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="font-medium mb-1 text-red-400">Invite failed</p>
          <p className="text-sm text-[var(--color-atib-text-muted)]">{error}</p>
          <button
            onClick={() => router.push("/login")}
            className="btn-secondary mt-4"
          >
            Go to login
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="glass-card p-8 w-full max-w-sm text-center glow-accent">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
        A
      </div>
      <span className="inline-block w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-3" />
      <p className="text-[var(--color-atib-text-muted)]">Loading...</p>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense fallback={<LoadingFallback />}>
        <AcceptInviteContent />
      </Suspense>
    </div>
  );
}
