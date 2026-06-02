"use client";

import { useState, useEffect } from "react";

type Tab = "api" | "team" | "workspace";

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
        {(["api", "team", "workspace"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t
                ? "bg-[var(--color-atib-accent)] text-white shadow-sm"
                : "text-[var(--color-atib-text-muted)] hover:text-[var(--color-atib-text)]"
            }`}
          >
            {t === "api" ? "API Keys" : t === "team" ? "Team" : "Workspace"}
          </button>
        ))}
      </div>

      {tab === "api" && <ApiKeysTab />}
      {tab === "team" && <TeamTab />}
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
