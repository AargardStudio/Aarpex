import React, { useCallback, useEffect, useState } from "react";
import { Link2, Copy, Check, RefreshCw, ShieldOff, KeyRound, AlertCircle } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { apiFetch } from "../../lib/apiClient";

interface Conn {
  id: string;
  label?: string;
  status: "pending" | "connected" | "revoked";
  webhook_url?: string | null;
  created_by_name?: string;
  created_at: string;
  connected_at?: string | null;
  last_verified_at?: string | null;
  last_used_at?: string | null;
  setup_expires_at?: string | null;
}
interface AuditRow {
  id: string;
  actor: string;
  action: string;
  entity?: string;
  created_at: string;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "--");

const CopyBtn: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="px-2 py-1 rounded-lg bg-[#252a36] hover:bg-[#2f3544] text-slate-200 text-[11px] font-semibold flex items-center gap-1 shrink-0"
    >
      {done ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
};

/** Settings -> Integrations: connect AarPex to the Aargard Founder's Dashboard. */
export const FounderDashboardCard: React.FC = () => {
  const { activeTenantId } = useCRM() as any;
  const [conns, setConns] = useState<Conn[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One-time secrets shown right after creation / rotation, never stored.
  const [setup, setSetup] = useState<{ token: string; expires: string } | null>(null);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const baseUrl = `${window.location.origin}/api/aargard-integration/v1`;

  const load = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const res = await apiFetch(`/api/integration-admin/status?tenantId=${encodeURIComponent(activeTenantId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not load status");
      setConns(data.connections || []);
      setAudit(data.audit || []);
      setError("");
    } catch (e: any) {
      setError(e.message || "Could not load status");
    }
  }, [activeTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (path: string, body: any) => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: activeTenantId, ...body }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Request failed");
      return data;
    } catch (e: any) {
      setError(e.message || "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const active = conns.find((c) => c.status === "connected");
  const pending = conns.find((c) => c.status === "pending" && (!c.setup_expires_at || new Date(c.setup_expires_at).getTime() > Date.now()));

  return (
    <div className="bg-[#181b21] rounded-2xl p-5 border border-[#2d323f] shadow-xl space-y-4 text-xs text-slate-200">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
          <Link2 className="w-4 h-4 text-teal-400" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-white">Aargard Founder's Dashboard</h3>
          <p className="text-slate-400 mt-0.5">
            Lets the Founder's Dashboard read this workspace's deals, leads, tasks and activity and make changes, using a secret key you control. Nothing is shared until you complete the steps below, and you can disconnect any time.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="rounded-xl border border-[#2d323f] bg-[#121418] p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${active ? "bg-emerald-400" : pending ? "bg-amber-400" : "bg-slate-600"}`} />
          <span className="font-bold text-white">{active ? "Connected" : pending ? "Waiting for the Dashboard to connect" : "Not connected"}</span>
        </div>
        {active && (
          <div className="text-slate-400 space-y-0.5">
            <div>Connected: {fmt(active.connected_at)} (set up by {active.created_by_name || "an admin"})</div>
            <div>Last verified: {fmt(active.last_verified_at)}</div>
            <div>Last request: {fmt(active.last_used_at)}</div>
            <div>Live events sent to: {active.webhook_url ? new URL(active.webhook_url).host : "not set (the Dashboard will poll instead)"}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {!active && (
            <button
              disabled={busy}
              onClick={async () => {
                const d = await post("/api/integration-admin/setup-token", { label: "Founder's Dashboard" });
                if (d) {
                  setSetup({ token: d.setup_token, expires: d.expires_at });
                  load();
                }
              }}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" /> {pending ? "Make a new setup token" : "Create setup token"}
            </button>
          )}
          {active && (
            <>
              <button
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Rotate the API key? The Dashboard stops working until you give it the new key.")) return;
                  const d = await post("/api/integration-admin/rotate", { connectionId: active.id });
                  if (d) setRotatedKey(d.api_key);
                }}
                className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] disabled:opacity-50 text-slate-200 font-semibold rounded-lg flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Rotate key
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Disconnect the Founder's Dashboard? Its key stops working immediately.")) return;
                  const d = await post("/api/integration-admin/revoke", { connectionId: active.id });
                  if (d) {
                    setSetup(null);
                    setRotatedKey(null);
                    load();
                  }
                }}
                className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 disabled:opacity-50 text-rose-200 border border-rose-800 font-semibold rounded-lg flex items-center gap-1.5"
              >
                <ShieldOff className="w-3.5 h-3.5" /> Disconnect
              </button>
            </>
          )}
          <button onClick={load} className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] text-slate-300 rounded-lg">
            Refresh
          </button>
        </div>
      </div>

      {setup && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 space-y-2">
          <div className="font-bold text-amber-200">Give these two values to the Founder's Dashboard team</div>
          <p className="text-amber-100/80">The setup token is shown once, works one time, and expires {fmt(setup.expires)}. Share it only through a private channel.</p>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-24 shrink-0">Base URL</span>
            <code className="flex-1 break-all text-teal-300">{baseUrl}</code>
            <CopyBtn text={baseUrl} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-24 shrink-0">Setup token</span>
            <code className="flex-1 break-all text-teal-300">{setup.token}</code>
            <CopyBtn text={setup.token} />
          </div>
          <p className="text-slate-400">The Dashboard exchanges the token for its API key. This page then shows "Connected".</p>
        </div>
      )}

      {rotatedKey && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 space-y-2">
          <div className="font-bold text-amber-200">New API key (shown once)</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-teal-300">{rotatedKey}</code>
            <CopyBtn text={rotatedKey} />
          </div>
        </div>
      )}

      <div>
        <div className="font-semibold text-white mb-1.5">Recent changes made by the Dashboard</div>
        {audit.length === 0 ? (
          <p className="text-slate-500">Nothing yet. Every change the Dashboard makes is recorded here.</p>
        ) : (
          <div className="rounded-lg border border-[#2d323f] divide-y divide-[#2d323f] max-h-56 overflow-y-auto">
            {audit.map((a) => (
              <div key={a.id} className="px-3 py-1.5 flex items-center justify-between gap-3">
                <span className="text-slate-300">
                  <span className="font-semibold text-white">{a.action}</span> <span className="text-slate-500">by {a.actor}</span>
                </span>
                <span className="text-slate-500 shrink-0">{fmt(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
