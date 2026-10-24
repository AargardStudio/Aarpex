import React, { useState } from "react";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { getSupabaseAuthClient } from "../../config/supabaseAuthClient";
import { useCRM } from "../../context/CRMContext";

/**
 * Full-screen step shown (a) the first time an invited teammate signs in from
 * their email link, and (b) after someone follows a "Forgot password" link.
 * Neither can reach the app until they've chosen a password.
 */
export const SetPasswordGate: React.FC<{ mode: "invite" | "recovery" }> = ({ mode }) => {
  const { clearPasswordGate, signOut, currentUser } = useCRM();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Please choose a password of at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    if (currentUser?.email && password.toLowerCase() === currentUser.email.toLowerCase()) {
      return setError("Your password can't be the same as your email address.");
    }
    setBusy(true);
    try {
      const supabase = getSupabaseAuthClient();
      const { error: err } = await supabase.auth.updateUser({ password, data: { needs_password: false } });
      if (err) {
        setError(
          /same|different/i.test(err.message)
            ? "Choose a password you haven't used before on this account."
            : /weak|pwned|easy to guess|known/i.test(err.message)
            ? "That password is too easy to guess or has appeared in a data breach. Please pick another."
            : err.message || "Couldn't save your password. Please try again."
        );
        setBusy(false);
        return;
      }
      clearPasswordGate();
    } catch (e: any) {
      setError(e?.message || "Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0d0f12] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-[#181b21] border border-[#2d323f] rounded-2xl p-7 space-y-4 text-slate-100 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#252a36] border border-[#3d4455] flex items-center justify-center text-teal-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white">
              {mode === "invite" ? "Welcome! Choose your password" : "Set a new password"}
            </h1>
            <p className="text-xs text-slate-400">
              {mode === "invite"
                ? "You'll use it to sign in next time. The email link only works once."
                : "Pick a new password for your AarPex account."}
            </p>
          </div>
        </div>

        {currentUser?.email && <div className="text-xs text-slate-400">Account: <span className="text-slate-200">{currentUser.email}</span></div>}

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">New password (8+ characters)</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-9 pr-10 py-2.5 bg-[#121418] border border-[#2d323f] rounded-lg text-sm focus:outline-none focus:border-teal-400"
              autoFocus
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" tabIndex={-1}>
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm password</label>
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3 py-2.5 bg-[#121418] border border-[#2d323f] rounded-lg text-sm focus:outline-none focus:border-teal-400"
          />
        </div>

        {error && <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800 rounded-lg p-2.5">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-60 text-[#0b0d11] font-bold rounded-lg text-sm"
        >
          {busy ? "Saving..." : mode === "invite" ? "Save password and continue" : "Save new password"}
        </button>
        <button type="button" onClick={() => signOut()} className="w-full text-[11px] text-slate-500 hover:text-slate-300 underline">
          Sign out instead
        </button>
      </form>
    </div>
  );
};
