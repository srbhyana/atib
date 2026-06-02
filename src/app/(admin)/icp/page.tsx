export const dynamic = 'force-dynamic';

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getICPDistribution } from "@/lib/agents/aggregate-dashboard";
import { db } from "@/lib/db/client";
import { transcripts } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export default async function ICPPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const distribution = await getICPDistribution(session.workspaceId);

  const companySizes = await db
    .select({
      size: transcripts.prospectCompanySize,
      cnt: sql<number>`count(*)::int`,
    })
    .from(transcripts)
    .where(eq(transcripts.workspaceId, session.workspaceId))
    .groupBy(transcripts.prospectCompanySize);

  const totalCalls = companySizes.reduce((a, b) => a + b.cnt, 0);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold">ICP Distribution</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Where are your calls landing? Core ICP, adjacent, or outside.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Segment Distribution */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-atib-text-dim)] mb-4">
            By Segment
          </h2>
          {distribution.length > 0 ? (
            <div className="space-y-3">
              {distribution.map((seg) => (
                <div key={seg.segment} className="flex items-center justify-between">
                  <span className="text-sm">{seg.segment || "Untagged"}</span>
                  <span className="text-sm font-medium text-[var(--color-atib-accent)]">{seg.cnt}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-atib-text-dim)]">No segment data yet.</p>
          )}
        </div>

        {/* Company Size Distribution */}
        <div className="glass-card p-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-atib-text-dim)] mb-4">
            By Company Size
          </h2>
          {companySizes.length > 0 ? (
            <div className="space-y-3">
              {companySizes.map((size) => {
                const pct = totalCalls > 0 ? Math.round((size.cnt / totalCalls) * 100) : 0;
                return (
                  <div key={size.size || "unknown"}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{size.size || "Unknown"}</span>
                      <span className="text-xs text-[var(--color-atib-text-dim)]">{pct}% ({size.cnt})</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-atib-border)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--color-atib-accent)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-atib-text-dim)]">No company size data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
