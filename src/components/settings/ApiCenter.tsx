import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Copy, Check, RefreshCw, ShieldOff, AlertCircle, Activity, BookOpen, Plus, Pencil, Link2, X } from "lucide-react";
import { useCRM } from "../../context/CRMContext";
import { apiFetch } from "../../lib/apiClient";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  expires_at?: string | null;
  created_by_name?: string;
  created_at: string;
  last_used_at?: string | null;
  request_count: number;
  revoked_at?: string | null;
}
interface Overview {
  base_url: string;
  api_version: string;
  rate_limit_per_minute: number;
  max_active_keys: number;
  keys: ApiKey[];
  usage_30d: { requests: number; errors: number; by_day: Record<string, { requests: number; errors: number }> };
  activity: { id: string; actor: string; action: string; entity?: string; request_id?: string; created_at: string }[];
  legacy_connections: { id: string; label?: string; status: string; connected_at?: string; last_used_at?: string }[];
  scopes: { scope: string; label: string; description: string }[];
  capabilities: {
    key: string;
    title: string;
    description: string;
    endpoints: { method: string; path: string; scope: string; summary: string }[];
    fields: { writable: string[]; required: string[] };
    filters: string[];
    webhook_events: string[];
  }[];
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

const CopyBtn: React.FC<{ text: string; label?: string }> = ({ text, label = "Copy" }) => {
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
      {done ? "Copied" : label}
    </button>
  );
};

type Tab = "overview" | "keys" | "docs";

/** Settings -> Integrations: Aargard Connect API & Integrations Center. */
export const ApiCenter: React.FC = () => {
  const { activeTenantId } = useCRM() as any;
  const [tab, setTab] = useState<Tab>("overview");
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // One-time secret shown right after creating or rotating a key. Never persisted.
  const [secret, setSecret] = useState<{ key: string; name: string } | null>(null);
  // create / edit form
  const [form, setForm] = useState<{ id?: string; name: string; scopes: string[]; expiry: string } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "rotate" | "revoke" } | null>(null);

  const load = useCallback(async () => {
    if (!activeTenantId) return;
    try {
      const res = await apiFetch(`/api/connect-admin/overview?tenantId=${encodeURIComponent(activeTenantId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Could not load API settings");
      setOv(data);
      setError("");
    } catch (e: any) {
      setError(e.message || "Could not load API settings");
    }
  }, [activeTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (method: string, path: string, body: any) => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: activeTenantId, ...body }) });
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

  const grouped = useMemo(() => {
    const m: Record<string, { title: string; read: string; write: string }> = {};
    for (const c of ov?.capabilities || []) m[c.key] = { title: c.title, read: `${c.key}:read`, write: `${c.key}:write` };
    return Object.entries(m);
  }, [ov]);

  const saveForm = async () => {
    if (!form) return;
    const expiresInDays = form.expiry === "never" ? "never" : Number(form.expiry);
    const d = form.id
      ? await call("PATCH", `/api/connect-admin/keys/${form.id}`, { name: form.name, scopes: form.scopes, expiresInDays })
      : await call("POST", "/api/connect-admin/keys", { name: form.name, scopes: form.scopes, expiresInDays });
    if (d) {
      if (d.api_key) setSecret({ key: d.api_key, name: form.name });
      setForm(null);
      load();
    }
  };

  const toggleScope = (s: string) =>
    setForm((f) => {
      if (!f) return f;
      let scopes = f.scopes.includes(s) ? f.scopes.filter((x) => x !== s) : [...f.scopes, s];
      // Changing data implies being able to see it.
      if (s.endsWith(":write") && scopes.includes(s)) {
        const r = s.replace(":write", ":read");
        if (!scopes.includes(r)) scopes = [...scopes, r];
      }
      if (s.endsWith(":read") && !scopes.includes(s)) scopes = scopes.filter((x) => x !== s.replace(":read", ":write"));
      return { ...f, scopes };
    });

  const keys = ov?.keys || [];
  const activeKeys = keys.filter((k) => k.status === "active");
  const days = Object.keys(ov?.usage_30d.by_day || {}).sort();
  const maxReq = Math.max(1, ...days.map((d) => ov!.usage_30d.by_day[d].requests));
  const errRate = ov && ov.usage_30d.requests ? Math.round((ov.usage_30d.errors / ov.usage_30d.requests) * 1000) / 10 : 0;
  const baseUrl = ov?.base_url || `${window.location.origin}/api/connect/v1`;

  const TabBtn: React.FC<{ id: Tab; icon: React.ReactNode; label: string }> = ({ id, icon, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap ${tab === id ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white hover:bg-[#1e232d]"}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="bg-[#181b21] rounded-2xl p-5 border border-[#2d323f] shadow-xl space-y-4 text-xs text-slate-200">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-teal-400" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-white">API & Integrations</h3>
          <p className="text-slate-400 mt-0.5">
            Let your website, automations or AI tools work with this workspace's leads, deals, pipelines, tasks and activities. Each key is limited to this workspace and to the permissions you choose, and you can revoke it instantly.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto">
        <TabBtn id="overview" icon={<Activity className="w-3.5 h-3.5" />} label="Overview" />
        <TabBtn id="keys" icon={<KeyRound className="w-3.5 h-3.5" />} label="API keys" />
        <TabBtn id="docs" icon={<BookOpen className="w-3.5 h-3.5" />} label="Documentation" />
      </div>

      {secret && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 space-y-2">
          <div className="font-bold text-amber-200">Copy your key for "{secret.name}" now. It won't be shown again.</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all bg-[#121418] rounded-lg px-2.5 py-2 text-teal-300">{secret.key}</code>
            <CopyBtn text={secret.key} />
          </div>
          <p className="text-slate-400">
            Store it as a server-side secret (for example <code className="text-slate-200">AARGARD_CONNECT_API_KEY</code>). Never put it in website code that visitors can see, in a public repository or in chat.
          </p>
          <button onClick={() => setSecret(null)} className="px-3 py-1.5 bg-[#252a36] hover:bg-[#2f3544] rounded-lg font-semibold">
            I've saved it
          </button>
        </div>
      )}

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              ["Active keys", `${activeKeys.length} / ${ov?.max_active_keys ?? "-"}`],
              ["Requests (30 days)", String(ov?.usage_30d.requests ?? 0)],
              ["Failed requests", String(ov?.usage_30d.errors ?? 0)],
              ["Error rate", `${errRate}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-[#2d323f] bg-[#121418] p-3">
                <div className="text-slate-400">{k}</div>
                <div className="text-lg font-bold text-white mt-0.5">{v}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[#2d323f] bg-[#121418] p-3 space-y-2">
            <div className="text-slate-400">Base URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all text-teal-300">{baseUrl}</code>
              <CopyBtn text={baseUrl} />
            </div>
            <div className="text-slate-500">Version {ov?.api_version}. Limit: {ov?.rate_limit_per_minute} requests per minute per key.</div>
          </div>

          <div className="rounded-xl border border-[#2d323f] bg-[#121418] p-3">
            <div className="text-slate-400 mb-2">Requests per day</div>
            {days.length === 0 ? (
              <div className="text-slate-500">No API traffic yet.</div>
            ) : (
              <div className="flex items-end gap-1 h-20" role="img" aria-label="Requests per day">
                {days.map((d) => (
                  <div key={d} title={`${d}: ${ov!.usage_30d.by_day[d].requests} requests, ${ov!.usage_30d.by_day[d].errors} failed`} className="flex-1 bg-teal-500/70 rounded-t" style={{ height: `${Math.max(4, (ov!.usage_30d.by_day[d].requests / maxReq) * 100)}%` }} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#2d323f] bg-[#121418] p-3 space-y-1.5">
            <div className="text-slate-400">Connected applications</div>
            {(ov?.legacy_connections || []).map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-semibold text-white">{c.label || "Founder's Dashboard"}</span>
                <span className="text-slate-500">{c.status}, last request {fmt(c.last_used_at)}</span>
              </div>
            ))}
            {activeKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-semibold text-white">{k.name}</span>
                <span className="text-slate-500">API key, last request {fmt(k.last_used_at)}</span>
              </div>
            ))}
            {!activeKeys.length && !(ov?.legacy_connections || []).length && <div className="text-slate-500">Nothing connected yet. Create an API key to get started.</div>}
          </div>

          <div className="rounded-xl border border-[#2d323f] bg-[#121418] p-3">
            <div className="text-slate-400 mb-1.5">Recent activity</div>
            {(ov?.activity || []).length === 0 ? (
              <div className="text-slate-500">Nothing yet.</div>
            ) : (
              <ul className="space-y-1">
                {ov!.activity.slice(0, 10).map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-x-2 text-slate-300">
                    <span className="text-slate-500">{fmt(a.created_at)}</span>
                    <span className="font-semibold">{a.action}</span>
                    <span className="text-slate-400">by {a.actor}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div className="space-y-3">
          {!form && (
            <button
              disabled={busy || activeKeys.length >= (ov?.max_active_keys ?? 10)}
              onClick={() => setForm({ name: "", scopes: [], expiry: "90" })}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Generate API key
            </button>
          )}

          {form && (
            <div className="rounded-xl border border-teal-500/30 bg-[#121418] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-white">{form.id ? "Edit key" : "New API key"}</div>
                <button onClick={() => setForm(null)} aria-label="Close" className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <label className="block">
                <span className="text-slate-400">1. Connection name</span>
                <input
                  value={form.name}
                  maxLength={60}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Website contact form"
                  className="mt-1 w-full bg-[#181b21] border border-[#2d323f] rounded-lg px-2.5 py-2 text-slate-100 outline-none focus:border-teal-500"
                />
              </label>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">2. What can it do?</span>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => setForm({ ...form, scopes: grouped.map(([, g]) => g.read) })} className="px-2 py-0.5 rounded bg-[#252a36] hover:bg-[#2f3544]">Read only</button>
                    <button type="button" onClick={() => setForm({ ...form, scopes: grouped.flatMap(([, g]) => [g.read, g.write]) })} className="px-2 py-0.5 rounded bg-[#252a36] hover:bg-[#2f3544]">Everything</button>
                    <button type="button" onClick={() => setForm({ ...form, scopes: [] })} className="px-2 py-0.5 rounded bg-[#252a36] hover:bg-[#2f3544]">Clear</button>
                  </span>
                </div>
                <div className="mt-1.5 rounded-lg border border-[#2d323f] divide-y divide-[#2d323f]">
                  {grouped.map(([key, g]) => (
                    <div key={key} className="flex items-center justify-between px-2.5 py-2">
                      <span className="font-semibold text-white">{g.title}</span>
                      <span className="flex gap-4">
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={form.scopes.includes(g.read)} onChange={() => toggleScope(g.read)} /> View
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={form.scopes.includes(g.write)} onChange={() => toggleScope(g.write)} /> Create, edit, delete
                        </label>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-slate-500 mt-1">Give each connection only what it needs. Keys can never manage your team, billing or settings.</p>
              </div>
              <label className="block">
                <span className="text-slate-400">3. Expires</span>
                <select value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} className="mt-1 w-full bg-[#181b21] border border-[#2d323f] rounded-lg px-2.5 py-2 text-slate-100">
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days (recommended)</option>
                  <option value="365">In 1 year</option>
                  <option value="never">Never</option>
                </select>
              </label>
              <button
                disabled={busy || !form.name.trim() || form.scopes.length === 0}
                onClick={saveForm}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold rounded-lg"
              >
                {form.id ? "Save changes" : "Generate key"}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {keys.length === 0 && <div className="text-slate-500">No API keys yet.</div>}
            {keys.map((k) => {
              const expired = k.expires_at && new Date(k.expires_at).getTime() <= Date.now();
              const state = k.status === "revoked" ? "Revoked" : expired ? "Expired" : "Active";
              return (
                <div key={k.id} className={`rounded-xl border border-[#2d323f] bg-[#121418] p-3 space-y-1.5 ${k.status === "revoked" || expired ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${state === "Active" ? "bg-emerald-400" : "bg-slate-600"}`} />
                    <span className="font-bold text-white">{k.name}</span>
                    <code className="text-slate-400">{k.key_prefix}...</code>
                    <span className="text-slate-500">{state}</span>
                  </div>
                  <div className="text-slate-400">
                    {k.scopes.length} permission{k.scopes.length === 1 ? "" : "s"}: {k.scopes.join(", ")}
                  </div>
                  <div className="text-slate-500">
                    Created {fmt(k.created_at)} by {k.created_by_name || "an admin"} · Expires {k.expires_at ? fmt(k.expires_at) : "never"} · Last used {fmt(k.last_used_at)} · {k.request_count} requests
                  </div>
                  {k.status === "active" && !expired && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button onClick={() => setForm({ id: k.id, name: k.name, scopes: k.scopes, expiry: "90" })} className="px-2.5 py-1 rounded-lg bg-[#252a36] hover:bg-[#2f3544] font-semibold flex items-center gap-1">
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      {confirm?.id === k.id && confirm.kind === "rotate" ? (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const d = await call("POST", `/api/connect-admin/keys/${k.id}/rotate`, {});
                            setConfirm(null);
                            if (d) {
                              setSecret({ key: d.api_key, name: k.name });
                              load();
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                        >
                          Confirm: the old key stops working now
                        </button>
                      ) : (
                        <button onClick={() => setConfirm({ id: k.id, kind: "rotate" })} className="px-2.5 py-1 rounded-lg bg-[#252a36] hover:bg-[#2f3544] font-semibold flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Rotate
                        </button>
                      )}
                      {confirm?.id === k.id && confirm.kind === "revoke" ? (
                        <button
                          disabled={busy}
                          onClick={async () => {
                            await call("POST", `/api/connect-admin/keys/${k.id}/revoke`, {});
                            setConfirm(null);
                            load();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold"
                        >
                          Confirm revoke
                        </button>
                      ) : (
                        <button onClick={() => setConfirm({ id: k.id, kind: "revoke" })} className="px-2.5 py-1 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 hover:bg-rose-900/50 font-semibold flex items-center gap-1">
                          <ShieldOff className="w-3 h-3" /> Revoke
                        </button>
                      )}
                      {confirm?.id === k.id && (
                        <button onClick={() => setConfirm(null)} className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-white">
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "docs" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#2d323f] bg-[#121418] p-3 space-y-2">
            <div className="font-bold text-white">Quick start</div>
            <p className="text-slate-400">Send your key as a Bearer token from your server. Responses are JSON; lists are paged with <code>?page=</code> and <code>?per_page=</code> (max 100).</p>
            <pre className="bg-[#0d0f12] rounded-lg p-2.5 overflow-x-auto text-teal-200">{`curl ${baseUrl}/leads?per_page=10 \\
  -H "Authorization: Bearer $AARGARD_CONNECT_API_KEY"

curl -X POST ${baseUrl}/leads \\
  -H "Authorization: Bearer $AARGARD_CONNECT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: contact-form-1042" \\
  -d '{"name":"Jane Doe","email":"jane@example.com","source":"Website"}'`}</pre>
            <p className="text-slate-500">Errors look like {`{ "error": { "code", "message" }, "request_id" }`}. Quote the request_id if you contact support. Deleting needs {`{ "confirm": true }`}. Machine-readable contract: <code>{baseUrl}/capabilities</code></p>
          </div>
          {(ov?.capabilities || []).map((c) => (
            <div key={c.key} className="rounded-xl border border-[#2d323f] bg-[#121418] p-3 space-y-1.5">
              <div className="font-bold text-white">{c.title}</div>
              <div className="text-slate-400">{c.description}</div>
              <ul className="space-y-0.5">
                {c.endpoints.map((e) => (
                  <li key={e.method + e.path} className="flex flex-wrap gap-x-2">
                    <span className="font-mono font-bold text-teal-300 w-14">{e.method}</span>
                    <code className="text-slate-200 break-all">{e.path.replace("/api/connect/v1", "")}</code>
                    <span className="text-slate-500">needs {e.scope}</span>
                  </li>
                ))}
              </ul>
              <div className="text-slate-400">Fields you can set: {c.fields.writable.join(", ")}. Required: {c.fields.required.join(", ")}.</div>
              {c.filters.length > 0 && <div className="text-slate-400">Filters: {c.filters.join(", ")}, q (search), updated_since.</div>}
              {c.webhook_events.length > 0 && <div className="text-slate-500">Webhook events: {c.webhook_events.join(", ")}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
