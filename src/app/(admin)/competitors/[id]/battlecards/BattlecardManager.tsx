"use client";

import { useState, useEffect, useCallback } from "react";
import type { BattlecardSections } from "@/lib/agents/battlecard";

interface CardSummary {
  id: string;
  archetype: string;
  status: string;
  generatedAt: string | null;
  approvedAt: string | null;
}

interface Props {
  competitor: { id: string; name: string; notes: string };
  initialCards: CardSummary[];
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  published: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  archived: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30",
};

export default function BattlecardManager({ competitor, initialCards }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCards[0]?.id ?? null
  );
  const [sections, setSections] = useState<BattlecardSections | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  const loadCard = useCallback(async (id: string) => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/battlecards/${id}`);
      const json = await res.json();
      if (json.ok) {
        setSections((json.data.sections as BattlecardSections) ?? null);
      } else {
        setMessage(json.error || "Failed to load card");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadCard(selectedId);
  }, [selectedId, loadCard]);

  async function handleGenerate() {
    setGenerating(true);
    setMessage("");
    try {
      const res = await fetch("/api/battlecards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorId: competitor.id,
          archetype: "universal",
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessage(json.message);
        const newCard: CardSummary = {
          id: json.data.id,
          archetype: "universal",
          status: "draft",
          generatedAt: new Date().toISOString(),
          approvedAt: null,
        };
        setCards([newCard, ...cards]);
        setSelectedId(newCard.id);
        setSections(json.data.sections);
      } else {
        setMessage(json.error || "Generation failed");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!selectedId || !sections) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/battlecards/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessage("Saved.");
      } else {
        setMessage(json.error || "Save failed");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(action: "publish" | "archive") {
    if (!selectedId) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/battlecards/${selectedId}/${action}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok) {
        setMessage(json.message);
        setCards(
          cards.map((c) =>
            c.id === selectedId ? { ...c, status: action === "publish" ? "published" : "archived" } : c
          )
        );
      } else {
        setMessage(json.error || `${action} failed`);
      }
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  function updateSection<K extends keyof BattlecardSections>(
    key: K,
    value: BattlecardSections[K]
  ) {
    if (!sections) return;
    setSections({ ...sections, [key]: value });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      {/* Sidebar — card list + actions */}
      <aside className="space-y-4">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full px-3 py-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-sm font-medium hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {generating ? "Generating..." : "+ Generate Universal card"}
        </button>

        {cards.length === 0 ? (
          <div className="text-xs text-[var(--color-atib-text-muted)] py-4">
            No battlecards yet. Generate one to see signal-backed talking points.
          </div>
        ) : (
          <ul className="space-y-1">
            {cards.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2 rounded-md border text-xs ${
                    selectedId === c.id
                      ? "border-[var(--color-atib-accent)] bg-[var(--color-atib-accent)]/5"
                      : "border-[var(--color-atib-border)] hover:bg-[var(--color-atib-hover)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium capitalize">{c.archetype}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] border ${STATUS_BADGE[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--color-atib-text-muted)]">
                    {c.generatedAt
                      ? new Date(c.generatedAt).toLocaleDateString()
                      : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {message && (
          <div className="text-xs text-[var(--color-atib-text-muted)] border-l-2 border-[var(--color-atib-accent)] pl-2">
            {message}
          </div>
        )}
      </aside>

      {/* Main — editor */}
      <section className="space-y-6">
        {!selectedId && (
          <div className="text-sm text-[var(--color-atib-text-muted)]">
            Nothing new this week. Generate a battlecard to start.
          </div>
        )}

        {selectedId && loading && (
          <div className="text-sm text-[var(--color-atib-text-muted)]">
            Loading card…
          </div>
        )}

        {selectedId && !loading && sections && (
          <>
            {/* Action bar */}
            <div className="flex items-center justify-between border-b border-[var(--color-atib-border)] pb-3">
              <div className="text-xs text-[var(--color-atib-text-muted)]">
                Confidence {sections.confidence}/5 ·{" "}
                {sections.evidenceFootnote || "—"}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md border border-[var(--color-atib-border)] text-xs hover:bg-[var(--color-atib-hover)] disabled:opacity-50"
                >
                  {saving ? "..." : "Save"}
                </button>
                <button
                  onClick={() => handleAction("publish")}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  Publish
                </button>
                <button
                  onClick={() => handleAction("archive")}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md border border-zinc-500/30 text-zinc-500 text-xs hover:bg-zinc-500/10 disabled:opacity-50"
                >
                  Archive
                </button>
              </div>
            </div>

            <Section label="Company Overview">
              <textarea
                value={sections.companyOverview}
                onChange={(e) => updateSection("companyOverview", e.target.value)}
                rows={2}
                className="w-full input-field"
              />
            </Section>

            <Section label="How To Position Us">
              <textarea
                value={sections.howToPositionUs}
                onChange={(e) =>
                  updateSection("howToPositionUs", e.target.value)
                }
                rows={2}
                className="w-full input-field"
              />
            </Section>

            <Section label="Why We Win">
              {sections.whyWeWin.length === 0 ? (
                <Empty>Insufficient progressed-call signal data. Submit transcripts that named this competitor in won deals.</Empty>
              ) : (
                <ul className="space-y-2">
                  {sections.whyWeWin.map((row, i) => (
                    <li
                      key={i}
                      className="border border-[var(--color-atib-border)] rounded-md p-3 text-xs space-y-1"
                    >
                      <div className="font-medium">{row.reason}</div>
                      <div className="text-[var(--color-atib-text-muted)] italic font-mono">
                        {row.quote}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section label="Objection Handling">
              {sections.objectionHandling.length === 0 ? (
                <Empty>No frequent objections recorded for this competitor yet.</Empty>
              ) : (
                <ul className="space-y-2">
                  {sections.objectionHandling.map((row, i) => (
                    <li
                      key={i}
                      className="border border-[var(--color-atib-border)] rounded-md p-3 text-xs space-y-1"
                    >
                      <div className="font-medium">“{row.objection}”</div>
                      <div className="text-[var(--color-atib-text-muted)]">
                        <strong>Respond:</strong> {row.response}
                      </div>
                      <div className="text-[var(--color-atib-text-muted)]">
                        <strong>Proof:</strong> {row.proof}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section label="Quick Dismisses">
              <Bullets items={sections.quickDismisses} empty="No verbatim dismisses captured yet." />
            </Section>

            <Section label="Landmines To Plant (Trap Questions)">
              <Bullets items={sections.landminesToPlant} empty="No trap questions surfaced yet." />
            </Section>

            <Section label="Why We Lose (When To Watch Out)">
              <Bullets items={sections.whyWeLose} empty="No documented losses to this competitor in the last 90 days." />
            </Section>

            <Section label="When To Watch Out">
              <Bullets items={sections.whenToWatchOut} empty="No risk patterns yet." />
            </Section>

            <Section label="Feature Comparison">
              {sections.featureComparison.length === 0 ? (
                <Empty>No features compared in signal data yet.</Empty>
              ) : (
                <table className="w-full text-xs border border-[var(--color-atib-border)] rounded-md">
                  <thead>
                    <tr className="text-left text-[var(--color-atib-text-muted)]">
                      <th className="px-2 py-1 border-b border-[var(--color-atib-border)]">Feature</th>
                      <th className="px-2 py-1 border-b border-[var(--color-atib-border)]">Us</th>
                      <th className="px-2 py-1 border-b border-[var(--color-atib-border)]">{competitor.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.featureComparison.map((row, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 align-top">{row.feature}</td>
                        <td className="px-2 py-1 align-top">{row.us}</td>
                        <td className="px-2 py-1 align-top">{row.them}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </>
        )}
      </section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold tracking-wide uppercase text-[var(--color-atib-text-muted)]">
        {label}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-[var(--color-atib-text-muted)] italic border-l-2 border-[var(--color-atib-border)] pl-2">
      {children}
    </div>
  );
}

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-1 text-xs list-disc pl-5">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}
