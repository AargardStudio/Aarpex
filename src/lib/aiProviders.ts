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
  // Matches the same model ids server.ts's callGeminiSafe() already uses
  // and falls back across -- keeping the dropdown in sync with what
  // actually works avoids offering a model id that 404s.
  gemini: [
    { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (fast, default)" },
    { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash (higher quality)" },
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
