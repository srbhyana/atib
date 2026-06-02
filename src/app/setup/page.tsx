"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { id: 1, label: "Company", desc: "Your positioning statement" },
  { id: 2, label: "Pillars", desc: "Three messaging pillars" },
  { id: 3, label: "Competitors", desc: "Top competitors to track" },
  { id: 4, label: "ICP", desc: "Ideal customer profile" },
  { id: 5, label: "Team", desc: "Invite your sales reps" },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<Array<{ email: string; link: string }>>([]);

  const [form, setForm] = useState({
    companyName: "",
    positioningStatement: "",
    pillar1: "",
    pillar2: "",
    pillar3: "",
    competitors: [
      { name: "", url: "", notes: "" },
      { name: "", url: "", notes: "" },
      { name: "", url: "", notes: "" },
    ],
    icpCore: "",
    icpAdjacent: "",
    brandVoice: "Direct, plain English, doctor not shaman.",
    teamEmails: ["", "", ""],
  });

  // Load existing context
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/canonical");
        const data = await res.json();
        if (data.ok && data.data) {
          const d = data.data;
          setForm((prev) => ({
            ...prev,
            companyName: d.companyName || prev.companyName,
            positioningStatement: d.positioningStatement || prev.positioningStatement,
            pillar1: d.pillars?.[0] || prev.pillar1,
            pillar2: d.pillars?.[1] || prev.pillar2,
            pillar3: d.pillars?.[2] || prev.pillar3,
            icpCore: d.icpCore || prev.icpCore,
            icpAdjacent: d.icpAdjacent || prev.icpAdjacent,
            brandVoice: d.brandVoice || prev.brandVoice,
          }));
        }
      } catch {}
    }
    load();
  }, []);

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateCompetitor(index: number, field: string, value: string) {
    setForm((prev) => {
      const competitors = [...prev.competitors];
      competitors[index] = { ...competitors[index], [field]: value };
      return { ...prev, competitors };
    });
  }

  function updateTeamEmail(index: number, value: string) {
    setForm((prev) => {
      const teamEmails = [...prev.teamEmails];
      teamEmails[index] = value;
      return { ...prev, teamEmails };
    });
  }

  async function saveStep() {
    setSaving(true);
    try {
      // Save canonical context
      await fetch("/api/canonical", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: form.companyName,
          positioningStatement: form.positioningStatement,
          pillar1: form.pillar1,
          pillar2: form.pillar2,
          pillar3: form.pillar3,
          icpCore: form.icpCore,
          icpAdjacent: form.icpAdjacent,
          brandVoice: form.brandVoice,
        }),
      });

      // If on competitors step, save competitors
      if (step === 3) {
        for (const comp of form.competitors) {
          if (comp.name.trim()) {
            await fetch("/api/canonical/competitors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(comp),
            });
          }
        }
      }

      // If on team step, send invitations
      if (step === 5) {
        const links: Array<{ email: string; link: string }> = [];
        for (const email of form.teamEmails) {
          if (email.trim()) {
            const res = await fetch("/api/invitations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: email.trim(), intendedRole: "sales_rep" }),
            });
            const data = await res.json();
            if (data.ok && data.invitation?.magicLink) {
              links.push({ email: email.trim(), link: data.invitation.magicLink });
            }
          }
        }
        setInviteLinks(links);
      }
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function nextStep() {
    await saveStep();
    if (step < 5) {
      setStep(step + 1);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.06),transparent_70%)] blur-3xl" />

      <div className="w-full max-w-2xl relative z-10">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s) => (
            <div key={s.id} className="flex-1">
              <div
                className={`h-1 rounded-full transition-all ${
                  s.id <= step ? "bg-[var(--color-atib-accent)]" : "bg-[var(--color-atib-border)]"
                }`}
              />
              <p className={`text-[10px] mt-1.5 ${s.id === step ? "text-[var(--color-atib-text)]" : "text-[var(--color-atib-text-dim)]"}`}>
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="glass-card p-8 glow-accent animate-fade-in-up">
          <h1 className="text-xl font-bold mb-1">{STEPS[step - 1].label}</h1>
          <p className="text-sm text-[var(--color-atib-text-muted)] mb-6">{STEPS[step - 1].desc}</p>

          {/* Step 1: Company */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Company Name</label>
                <input className="input-field" value={form.companyName} onChange={(e) => updateForm("companyName", e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Positioning Statement</label>
                <textarea className="input-field min-h-[100px] resize-y" value={form.positioningStatement} onChange={(e) => updateForm("positioningStatement", e.target.value)} placeholder="For [ideal client] who [frame of reference], our product is [point of difference] because [reason to believe]." />
              </div>
            </div>
          )}

          {/* Step 2: Pillars */}
          {step === 2 && (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div key={n}>
                  <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Pillar {n}</label>
                  <input className="input-field" value={form[`pillar${n}` as keyof typeof form] as string} onChange={(e) => updateForm(`pillar${n}`, e.target.value)} placeholder={`Messaging pillar ${n}`} />
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Competitors */}
          {step === 3 && (
            <div className="space-y-6">
              {form.competitors.map((comp, i) => (
                <div key={i} className="p-4 rounded-lg bg-[var(--color-atib-surface)]/50 space-y-3">
                  <p className="text-xs font-semibold text-[var(--color-atib-text-dim)] uppercase tracking-wider">Competitor {i + 1}</p>
                  <input className="input-field" value={comp.name} onChange={(e) => updateCompetitor(i, "name", e.target.value)} placeholder="Competitor name" />
                  <input className="input-field" value={comp.url} onChange={(e) => updateCompetitor(i, "url", e.target.value)} placeholder="Website URL" />
                  <textarea className="input-field min-h-[60px] resize-y text-xs" value={comp.notes} onChange={(e) => updateCompetitor(i, "notes", e.target.value)} placeholder="Battlecard notes — what should we know when this competitor is named?" />
                </div>
              ))}
            </div>
          )}

          {/* Step 4: ICP */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Core ICP</label>
                <textarea className="input-field min-h-[80px] resize-y" value={form.icpCore} onChange={(e) => updateForm("icpCore", e.target.value)} placeholder="Describe your ideal customer: role, company size, industry, pain points..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Adjacent ICP</label>
                <textarea className="input-field min-h-[60px] resize-y" value={form.icpAdjacent} onChange={(e) => updateForm("icpAdjacent", e.target.value)} placeholder="Secondary segments you sell into but aren't your core..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Brand Voice</label>
                <input className="input-field" value={form.brandVoice} onChange={(e) => updateForm("brandVoice", e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 5: Team */}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-atib-text-muted)]">
                Invite your sales reps. They&apos;ll receive a magic link to sign in — no password needed.
              </p>
              {form.teamEmails.map((email, i) => (
                <input key={i} className="input-field" type="email" value={email} onChange={(e) => updateTeamEmail(i, e.target.value)} placeholder={`rep${i + 1}@company.com`} />
              ))}
              {inviteLinks.length > 0 && (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                  <p className="text-sm font-medium text-emerald-400">Invites created!</p>
                  {inviteLinks.map((link, i) => (
                    <div key={i} className="text-xs text-[var(--color-atib-text-muted)]">
                      <span className="font-medium">{link.email}</span>
                      <input className="input-field mt-1 text-xs" readOnly value={link.link} onClick={(e) => (e.target as HTMLInputElement).select()} />
                    </div>
                  ))}
                  <p className="text-[10px] text-[var(--color-atib-text-dim)]">Share these links with your reps. They expire in 14 days.</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="btn-secondary disabled:opacity-30">
              Back
            </button>
            <button onClick={nextStep} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {step === 5 ? "Complete Setup" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
