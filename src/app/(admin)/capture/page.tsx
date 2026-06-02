"use client";

import { useState } from "react";

interface SoapResult {
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    confidence: { subjective: number; objective: number; assessment: number; plan: number };
  };
  analysis: {
    qualityWarning: string;
    signals: Array<{
      title: string;
      type: string;
      quote: string;
      polarity: string;
      state: string;
    }>;
  };
  source: string;
}

export default function CapturePage() {
  const [transcript, setTranscript] = useState("");
  const [account, setAccount] = useState("");
  const [contact, setContact] = useState("");
  const [prospectRole, setProspectRole] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [callDate, setCallDate] = useState(new Date().toISOString().slice(0, 10));
  const [callOutcome, setCallOutcome] = useState("unclear");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SoapResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!transcript.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          account,
          contact,
          prospectRole,
          companySize,
          callDate,
          callOutcome,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setResult({ soap: data.soap, analysis: data.analysis, source: data.source });
      } else {
        setError(data.error || "Failed to process transcript.");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTranscript("");
    setAccount("");
    setContact("");
    setProspectRole("");
    setCompanySize("");
    setCallDate(new Date().toISOString().slice(0, 10));
    setCallOutcome("unclear");
    setResult(null);
    setError("");
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Capture a Call</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Paste your transcript below. The AI will extract positioning signals in under 30 seconds.
        </p>
      </div>

      {!result ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="capture-account" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Account</label>
              <input id="capture-account" className="input-field" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Prospect company name" />
            </div>
            <div>
              <label htmlFor="capture-contact" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Contact</label>
              <input id="capture-contact" className="input-field" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Person you spoke with" />
            </div>
            <div>
              <label htmlFor="capture-role" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Prospect Role</label>
              <input id="capture-role" className="input-field" value={prospectRole} onChange={(e) => setProspectRole(e.target.value)} placeholder="VP Engineering, CTO, etc." />
            </div>
            <div>
              <label htmlFor="capture-size" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Company Size</label>
              <select id="capture-size" className="input-field" value={companySize} onChange={(e) => setCompanySize(e.target.value)}>
                <option value="">Select</option>
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-200">51-200</option>
                <option value="201-1000">201-1000</option>
                <option value="1001+">1001+</option>
              </select>
            </div>
            <div>
              <label htmlFor="capture-date" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Call Date</label>
              <input id="capture-date" className="input-field" type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="capture-outcome" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Call Outcome</label>
              <select id="capture-outcome" className="input-field" value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)}>
                <option value="unclear">Unclear</option>
                <option value="progressed">Progressed</option>
                <option value="stalled">Stalled</option>
                <option value="lost">Lost</option>
              </select>
            </div>
          </div>

          {/* Transcript */}
          <div>
            <label htmlFor="capture-transcript" className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
              Transcript
            </label>
            <textarea
              id="capture-transcript"
              className="input-field min-h-[250px] resize-y font-mono text-sm"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your call transcript here...

Example format:
Rep: Hi, thanks for taking the time today...
Prospect: Sure, we've been looking at solutions for..."
              required
            />
            <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-1">
              {transcript.split(/\s+/).filter(Boolean).length} words · Privacy: names and figures will be redacted automatically
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !transcript.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing transcript...
              </>
            ) : (
              "Submit & Analyze"
            )}
          </button>
        </form>
      ) : (
        /* Results View */
        <div className="space-y-6 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Call Intelligence</h2>
              <p className="text-xs text-[var(--color-atib-text-dim)]">
                Source: {result.source === "llm" ? "Claude Sonnet" : "Heuristic fallback"}
                {result.analysis.qualityWarning && ` · ⚠ ${result.analysis.qualityWarning}`}
              </p>
            </div>
            <button onClick={resetForm} className="btn-secondary text-xs">
              New Capture
            </button>
          </div>

          {/* SOAP Note */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-atib-text-dim)]">SOAP Note</h3>

            <SoapSection label="Subjective" content={result.soap.subjective} confidence={result.soap.confidence.subjective} />
            <SoapSection label="Objective" content={result.soap.objective} confidence={result.soap.confidence.objective} />
            <SoapSection label="Assessment" content={result.soap.assessment} confidence={result.soap.confidence.assessment} />
            <SoapSection label="Plan" content={result.soap.plan} confidence={result.soap.confidence.plan} />
          </div>

          {/* Signals */}
          {result.analysis.signals && result.analysis.signals.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-atib-text-dim)] mb-4">
                Language That Worked · {result.analysis.signals.length} signals
              </h3>
              <div className="space-y-3">
                {result.analysis.signals.map((signal, i) => (
                  <div key={i} className="p-3 rounded-lg bg-[var(--color-atib-surface)]/50 animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`tier-${signal.state} text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase`}>
                        {signal.state}
                      </span>
                      <span className="text-sm font-medium">{signal.title}</span>
                    </div>
                    {signal.quote && <p className="verbatim-quote text-xs mt-2">{signal.quote}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--color-atib-text-dim)]">
                      <span>{signal.type}</span>
                      <span>{signal.polarity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SoapSection({ label, content, confidence }: { label: string; content: string; confidence: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-[var(--color-atib-accent)]">{label}</span>
        <div className="confidence-dots">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={`confidence-dot ${n <= confidence ? "active" : ""}`} />
          ))}
        </div>
      </div>
      <p className="text-sm text-[var(--color-atib-text-muted)] leading-relaxed">{content}</p>
    </div>
  );
}
