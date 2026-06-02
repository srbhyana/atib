export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { transcripts } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import Link from "next/link";

export default async function CallsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const conditions = [eq(transcripts.workspaceId, session.workspaceId)];
  if (session.role === "sales_rep") {
    conditions.push(eq(transcripts.repId, session.id));
  }

  const calls = await db
    .select({
      id: transcripts.id,
      account: transcripts.prospectAccount,
      contact: transcripts.prospectContact,
      callDate: transcripts.callDate,
      callOutcome: transcripts.callOutcome,
      createdAt: transcripts.createdAt,
    })
    .from(transcripts)
    .where(and(...conditions))
    .orderBy(desc(transcripts.createdAt))
    .limit(50);

  const outcomeColors: Record<string, string> = {
    progressed: "text-emerald-400",
    stalled: "text-yellow-400",
    lost: "text-red-400",
    unclear: "text-[var(--color-atib-text-dim)]",
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {session.role === "sales_rep" ? "My Calls" : "All Calls"}
          </h1>
          <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
            {calls.length} call{calls.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
        {session.role === "sales_rep" && (
          <Link href="/capture" className="btn-primary text-sm">
            + Capture Call
          </Link>
        )}
      </div>

      {calls.length > 0 ? (
        <div className="space-y-2">
          {calls.map((call, i) => (
            <Link
              key={call.id}
              href={session.role === "sales_rep" ? `/calls/${call.id}` : `/signals?transcript=${call.id}`}
              className="glass-card glass-card-hover p-4 flex items-center gap-4 animate-fade-in-up block"
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {call.account || "Unknown Account"}
                </p>
                <p className="text-xs text-[var(--color-atib-text-dim)]">
                  {call.contact || "Unknown Contact"} · {call.callDate}
                </p>
              </div>
              <span className={`text-xs font-medium ${outcomeColors[call.callOutcome] || ""}`}>
                {call.callOutcome}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state py-16">
          <div className="text-4xl mb-3 opacity-30">📞</div>
          <p className="empty-state-title">No calls yet.</p>
          <p className="empty-state-desc">
            {session.role === "sales_rep"
              ? "Paste your first call transcript to get started."
              : "Calls will appear here as your reps submit transcripts."}
          </p>
        </div>
      )}
    </div>
  );
}
