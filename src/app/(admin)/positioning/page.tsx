"use client";

import { useState } from "react";

export default function PositioningPage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [framework, setFramework] = useState("5c");

  async function runAudit() {
    setRunning(true);
    try {
      const res = await fetch(`/api/positioning/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ framework }),
      });
      const data = await res.json();
      if (data.ok) setResults(data.data);
    } catch {}
    setRunning(false);
  }

  const FRAMEWORKS = [
    { id: "5c", label: "5C Feasibility", desc: "Customer, Company, Context, Competition, Profitability" },
    { id: "kindergarten", label: "Kindergarten Test", desc: "Can a five-year-old describe what you do?" },
    { id: "need_gap", label: "Need Gap Mapping", desc: "Where are your prospects in the awareness→enhancement spectrum?" },
    { id: "pop_pod", label: "PoP vs PoD", desc: "Parity collapsing or differentiation failing?" },
    { id: "laddering", label: "Laddering Analysis", desc: "Feature → Advantage → Terminal Benefit chains" },
    { id: "needscope", label: "NeedScope", desc: "Rational, social, or emotive resonance?" },
    { id: "positioning_statement", label: "Positioning Audit", desc: "Monthly full positioning statement validation" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold">Positioning Engine</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Seven frameworks, one truth. Run audits against your accumulated signal data.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {FRAMEWORKS.map((fw) => (
          <button
            key={fw.id}
            onClick={() => setFramework(fw.id)}
            className={`glass-card glass-card-hover p-4 text-left transition-all ${
              framework === fw.id ? "border-[var(--color-atib-accent)]/40 glow-accent" : ""
            }`}
          >
            <h3 className="text-sm font-medium mb-0.5">{fw.label}</h3>
            <p className="text-xs text-[var(--color-atib-text-dim)]">{fw.desc}</p>
          </button>
        ))}
      </div>

      <button onClick={runAudit} disabled={running} className="btn-primary flex items-center gap-2">
        {running && <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
        {running ? "Running..." : `Run ${FRAMEWORKS.find((f) => f.id === framework)?.label}`}
      </button>

      {results && (
        <div className="glass-card p-6 animate-fade-in-up">
          <h2 className="text-sm font-semibold mb-4">Audit Results</h2>
          <pre className="text-xs text-[var(--color-atib-text-muted)] font-mono overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
