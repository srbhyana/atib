"use client";

import { useState, useEffect } from "react";

type Tab = "api" | "team" | "import" | "workspace";

const TAB_LABELS: Record<Tab, string> = {
  api: "API Keys",
  team: "Team",
  import: "Import",
  workspace: "Workspace",
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("api");

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--color-atib-text-muted)] mt-1">
          Configure your workspace, team access, and model keys.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-atib-surface)] w-fit">
        {(["api", "team", "import", "workspace"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t
                ? "bg-[var(--color-atib-accent)] text-white shadow-sm"
                : "text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)]"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "api" && <ApiKeysTab />}
      {tab === "team" && <TeamTab />}
      {tab === "import" && <ImportTab />}
      {tab === "workspace" && <WorkspaceTab />}
    </div>
  );
}

function ApiKeysTab() {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [savedAnthropic, setSavedAnthropic] = useState<string | null>(null);
  const [savedOpenai, setSavedOpenai] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings/keys")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setSavedAnthropic(data.keys.anthropic);
          setSavedOpenai(data.keys.openai);
        }
      })
      .catch(() => {});
  }, []);

  async function saveKeys() {
    setSaving(true);
    setMessage("");
    try {
      const body: Record<string, string> = {};
      if (anthropicKey) body.anthropicApiKey = anthropicKey;
      if (openaiKey) body.openaiApiKey = openaiKey;

      const res = await fetch("/api/settings/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(data.tested ? "Key saved and tested." : "Keys saved successfully.");
        setAnthropicKey("");
        setOpenaiKey("");
        // Refresh display
        const refresh = await fetch("/api/settings/keys").then((r) => r.json());
        if (refresh.ok) {
          setSavedAnthropic(refresh.keys.anthropic);
          setSavedOpenai(refresh.keys.openai);
        }
      } else {
        setMessage(data.error || "Failed to save.");
      }
    } catch {
      setMessage("Connection failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-card p-6 space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold mb-1">AI API Keys</h3>
        <p className="text-xs text-[var(--color-atib-text-dim)]">
          Saved once per PMM workspace. Reps use this same workspace key automatically when they submit calls.
        </p>
      </div>

      {/* Anthropic */}
      <div>
        <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
          Anthropic API Key
          {savedAnthropic && (
            <span className="ml-2 text-emerald-400 text-xs font-normal">
              ✓ Connected ({savedAnthropic})
            </span>
          )}
        </label>
        <input
          type="password"
          className="input-field font-mono"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder={savedAnthropic || "sk-ant-api03-..."}
        />
        <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-1">
          Required for full SOAP analysis. Get one at{" "}
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener" className="text-[var(--color-atib-accent)] hover:underline">
            console.anthropic.com
          </a>
        </p>
      </div>

      {/* OpenAI */}
      <div>
        <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">
          OpenAI API Key
          {savedOpenai && (
            <span className="ml-2 text-emerald-400 text-xs font-normal">
              ✓ Connected ({savedOpenai})
            </span>
          )}
        </label>
        <input
          type="password"
          className="input-field font-mono"
          value={openaiKey}
          onChange={(e) => setOpenaiKey(e.target.value)}
          placeholder={savedOpenai || "sk-..."}
        />
        <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-1">
          Optional. Used for signal dedup via embeddings.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.includes("success")
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          {message}
        </div>
      )}

      <button
        onClick={saveKeys}
        disabled={saving || (!anthropicKey && !openaiKey)}
        className="btn-primary flex items-center gap-2"
      >
        {saving ? (
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : null}
        {saving ? "Saving..." : "Save API Keys"}
      </button>
    </div>
  );
}

function TeamTab() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales_rep");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function sendInvite() {
    setSending(true);
    setMessage("");
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), intendedRole: role }),
      });
      const data = await res.json();
      if (data.ok) {
        const inviteUrl = data.invitation?.magicLink || data.inviteUrl;
        if (data.delivery === "email") {
          setMessage(data.warning || `Invite sent to ${email.trim()}.`);
        } else {
          setMessage(`Invite created. Share this link: ${inviteUrl || "Check the invite response."}`);
        }
        setEmail("");
      } else {
        setMessage(data.error || "Failed to send invite.");
      }
    } catch {
      setMessage("Connection failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="glass-card p-6 space-y-6 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold mb-1">Invite Team Members</h3>
        <p className="text-xs text-[var(--color-atib-text-dim)]">
          Create real user accounts with magic-link access. Reps get capture access. PMMs keep the dashboard.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Email</label>
          <input
            type="email"
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="rep@company.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-atib-text-muted)] mb-1.5">Role</label>
          <select
            className="input-field"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="sales_rep">Sales Rep</option>
            <option value="sales_leader">Sales Leader</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.includes("created")
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          {message}
        </div>
      )}

      <button
        onClick={sendInvite}
        disabled={sending || !email}
        className="btn-primary flex items-center gap-2"
      >
        {sending ? (
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : null}
        {sending ? "Sending..." : "Send Invite"}
      </button>
    </div>
  );
}

type Row = Record<string, string>;
type RowResult = { row: number; status: "ok" | "failed"; reason?: string };

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const flushField = () => {
    row.push(field);
    field = "";
  };
  const flushRow = () => {
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      flushField();
    } else if (char === "\n") {
      flushField();
      flushRow();
    } else if (char === "\r") {
      // skip
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    flushField();
    flushRow();
  }
  const nonEmpty = rows.filter((entry) => entry.some((cell) => cell.trim().length));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((cell) => cell.trim());
  return nonEmpty.slice(1).map((entry) => {
    const record: Row = {};
    headers.forEach((key, index) => {
      record[key] = entry[index] != null ? entry[index].trim() : "";
    });
    return record;
  });
}

// The DB enum for call_outcome only allows 4 values. CSVs in the wild
// carry richer prose ("WON · 412-station rollout", "STALLED · 3-week
// security review"), so map the leading keyword down to the enum. Anything
// unrecognised lands on "unclear" — safe default, lets the row land.
function normalizeCallOutcome(raw: string | undefined): "progressed" | "stalled" | "lost" | "unclear" {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "unclear";
  if (v.startsWith("won") || v.startsWith("progressed") || v.startsWith("advanced") || v.startsWith("signed")) {
    return "progressed";
  }
  if (v.startsWith("stalled") || v.startsWith("paused") || v.startsWith("blocked")) {
    return "stalled";
  }
  if (v.startsWith("lost") || v.startsWith("dead") || v.startsWith("closed-lost")) {
    return "lost";
  }
  return "unclear";
}

function ImportTab() {
  return (
    <div className="space-y-6 max-w-2xl">
      <DemoSeed />
      <CallsImporter />
      <SignalsImporter />
    </div>
  );
}

function DemoSeed() {
  const [busy, setBusy] = useState<"refive" | "flowace" | null>(null);
  const [message, setMessage] = useState("");

  async function seed(preset: "refive" | "flowace") {
    setBusy(preset);
    setMessage("");
    try {
      const res = await fetch("/api/setup/seed-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage(json.message || "Canonical context seeded.");
      } else {
        setMessage(json.error || `Seed failed (HTTP ${res.status}).`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Seed canonical context</h3>
        <p className="text-xs text-[var(--color-atib-text-dim)]">
          Replaces your workspace&apos;s positioning, pillars, ICP, and competitors with a demo preset.
          Run this before uploading the matching calls CSV so the dashboard&apos;s pillar lights align.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => seed("refive")}
          disabled={busy !== null}
          className="btn-primary inline-flex items-center gap-2"
        >
          {busy === "refive" ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          {busy === "refive" ? "Seeding..." : "Use Refive preset"}
        </button>
        <button
          onClick={() => seed("flowace")}
          disabled={busy !== null}
          className="btn-secondary inline-flex items-center gap-2"
        >
          {busy === "flowace" ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : null}
          {busy === "flowace" ? "Seeding..." : "Use Flowace preset"}
        </button>
      </div>
      {message ? (
        <div className="p-3 rounded-lg text-sm bg-[var(--color-atib-surface)]/50 text-[var(--color-atib-text-muted)]">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function CallsImporter() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<RowResult[]>([]);
  const [message, setMessage] = useState("");

  async function handleFile(file: File) {
    setBusy(true);
    setResults([]);
    setMessage("");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setMessage("CSV had no data rows.");
        return;
      }
      setProgress({ done: 0, total: rows.length });
      const collected: RowResult[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.transcript) {
          collected.push({ row: i + 1, status: "failed", reason: "Missing transcript." });
          setProgress({ done: i + 1, total: rows.length });
          continue;
        }
        try {
          const res = await fetch("/api/transcripts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account: row.account || "",
              contact: row.contact || "",
              prospectRole: row.prospectRole || "",
              companySize: row.companySize || "",
              callDate: row.callDate || row.date || new Date().toISOString().slice(0, 10),
              callOutcome: normalizeCallOutcome(row.callOutcome),
              transcript: row.transcript,
            }),
          });
          const json = await res.json();
          if (res.ok && json.ok) {
            collected.push({ row: i + 1, status: "ok" });
          } else {
            collected.push({
              row: i + 1,
              status: "failed",
              reason: json.error || `HTTP ${res.status}`,
            });
          }
        } catch (err) {
          collected.push({
            row: i + 1,
            status: "failed",
            reason: err instanceof Error ? err.message : "Network error",
          });
        }
        setProgress({ done: i + 1, total: rows.length });
        setResults([...collected]);
      }
      const ok = collected.filter((r) => r.status === "ok").length;
      setMessage(`Bulk calls upload: ${ok} saved, ${collected.length - ok} skipped.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not read CSV.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Bulk upload calls</h3>
        <p className="text-xs text-[var(--color-atib-text-dim)]">
          Each row runs through the SOAP pipeline. Expect a few seconds per call.
        </p>
        <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-2 font-mono">
          Headers: account, contact, callDate, callOutcome, transcript
        </p>
      </div>
      <label className="btn-primary inline-flex items-center gap-2 cursor-pointer w-fit">
        {busy ? (
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : null}
        {busy ? `Uploading ${progress?.done ?? 0}/${progress?.total ?? 0}...` : "Bulk upload CSV"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFile(file);
            }
            e.target.value = "";
          }}
        />
      </label>
      {message ? (
        <div className="p-3 rounded-lg text-sm bg-[var(--color-atib-surface)]/50 text-[var(--color-atib-text-muted)]">
          {message}
        </div>
      ) : null}
      {results.length > 0 ? (
        <div className="max-h-48 overflow-y-auto text-xs font-mono space-y-1">
          {results.map((r) => (
            <div
              key={r.row}
              className={r.status === "ok" ? "text-emerald-400" : "text-red-400"}
            >
              Row {r.row}: {r.status === "ok" ? "saved" : `failed — ${r.reason}`}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SignalsImporter() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ row: number; reason: string }[]>([]);

  async function handleFile(file: File) {
    setBusy(true);
    setMessage("");
    setErrors([]);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setMessage("CSV had no data rows.");
        return;
      }
      const res = await fetch("/api/signals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage(json.message || `Inserted ${json.inserted} signals.`);
        setErrors(json.errors || []);
      } else {
        setMessage(json.error || `Upload failed (HTTP ${res.status}).`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not read CSV.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-card p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-1">Bulk upload signals</h3>
        <p className="text-xs text-[var(--color-atib-text-dim)]">
          Seeds the signal bank directly. Use this to import a baseline of approved findings.
        </p>
        <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-2 font-mono">
          Headers: title, content, signalType, tier, polarity, strategicImportance, pillarTag, verbatimQuote, competitorName
        </p>
        <p className="text-[10px] text-[var(--color-atib-text-dim)] mt-1">
          signalType must be one of: objection, language_pattern, competitor_mention, use_case, ICP_signal, pricing_signal, feature_request, buying_trigger, churn_risk, expansion_signal.
        </p>
      </div>
      <label className="btn-primary inline-flex items-center gap-2 cursor-pointer w-fit">
        {busy ? (
          <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : null}
        {busy ? "Uploading..." : "Bulk upload CSV"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFile(file);
            }
            e.target.value = "";
          }}
        />
      </label>
      {message ? (
        <div className="p-3 rounded-lg text-sm bg-[var(--color-atib-surface)]/50 text-[var(--color-atib-text-muted)]">
          {message}
        </div>
      ) : null}
      {errors.length > 0 ? (
        <div className="max-h-48 overflow-y-auto text-xs font-mono space-y-1">
          {errors.map((e) => (
            <div key={e.row} className="text-red-400">
              Row {e.row}: {e.reason}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceTab() {
  return (
    <div className="glass-card p-6 space-y-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold mb-1">Workspace</h3>
        <p className="text-xs text-[var(--color-atib-text-dim)]">
          Workspace configuration coming in v1.1.
        </p>
      </div>
      <div className="p-4 rounded-lg bg-[var(--color-atib-surface)]/50 text-sm text-[var(--color-atib-text-muted)]">
        Plan: <span className="text-[var(--color-atib-accent)] font-medium">Beta (Free)</span>
      </div>
    </div>
  );
}
