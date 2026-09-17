import React, { useState } from "react";
import { X, Package, DollarSign, RefreshCw, AlertCircle } from "lucide-react";
import { TenantBillingProduct } from "../../types";
import { apiFetch } from "../../lib/apiClient";

interface ProductPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  stripeSecretKey: string;
  currency: string;
  onCreated: (product: TenantBillingProduct) => void;
}

export const ProductPricingModal: React.FC<ProductPricingModalProps> = ({
  isOpen,
  onClose,
  stripeSecretKey,
  currency,
  onCreated,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricingType, setPricingType] = useState<"recurring" | "one_time">("recurring");
  const [interval, setInterval] = useState<"month" | "year" | "week" | "day">("month");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setName("");
    setDescription("");
    setAmount("");
    setPricingType("recurring");
    setInterval("month");
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!stripeSecretKey?.trim()) {
      setError("Connect your Stripe secret key in Settings > Stripe Custom Keys first.");
      return;
    }
    if (!name.trim()) {
      setError("Product name is required.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("Enter a price amount greater than 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/stripe/products/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: stripeSecretKey.trim(),
          name: name.trim(),
          description: description.trim(),
          pricingType,
          amount: Number(amount),
          currency: (currency || "USD").toLowerCase(),
          interval: pricingType === "recurring" ? interval : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create product in Stripe.");
        setIsSubmitting(false);
        return;
      }
      onCreated(data.product as TenantBillingProduct);
      resetAndClose();
    } catch (err: any) {
      setError(err.message || "Unable to reach the billing service.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-xs text-slate-700">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Create Product & Price</h2>
              <p className="text-[11px] text-slate-500">Created directly in your connected Stripe account.</p>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-medium flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Product Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monthly Retainer, Onboarding Fee"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown on the Stripe payment link and receipts"
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-600 mb-1.5">Pricing Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPricingType("recurring")}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  pricingType === "recurring"
                    ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <div className="font-bold text-xs">Subscription</div>
                <div className="text-[10px] mt-0.5 opacity-80">Recurring charge</div>
              </button>
              <button
                type="button"
                onClick={() => setPricingType("one_time")}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  pricingType === "one_time"
                    ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <div className="font-bold text-xs">One-Time Fee</div>
                <div className="text-[10px] mt-0.5 opacity-80">Single charge</div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">
                Amount ({(currency || "USD").toUpperCase()})
              </label>
              <div className="relative">
                <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            {pricingType === "recurring" && (
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Billing Interval</label>
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as typeof interval)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={resetAndClose}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSubmitting ? "Creating..." : "Create in Stripe"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
