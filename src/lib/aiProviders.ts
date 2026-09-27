// Hardcoded model choices offered per AI provider for Industry Agents. A
// short, curated list rather than a live "list models" call to that
// provider's API -- per the confirmed product decision, this keeps the
// dropdown simple and avoids a provider round-trip just to configure an
// agent. Add to these lists as new models are worth offering; nothing else
// needs to change to support a new model of an already-supported provider.
import type { AIProvider } from "../types";

export interface AIModelOption {
  value: string;
  label: string;
}

export const AI_PROVIDER_MODELS: Record<AIProvider, AIModelOption[]> = {
  gemini: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, default)" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (higher quality)" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o mini (fast, default)" },
    { value: "gpt-4o", label: "GPT-4o (higher quality)" },
  ],
};

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
};

export function defaultModelFor(provider: AIProvider): string {
  return AI_PROVIDER_MODELS[provider][0].value;
}
