// Agent "nature" and Myers-Briggs personality dials for Industry Agents.
//
// Both are optional, purely additive personality layers on top of an
// agent's existing tone/talkingPoints/painPoints/objectionNotes/
// customInstructions -- they never replace those, they just color how the
// AI expresses them. Descriptions here are the exact strings shown in the
// UI; server.ts keeps its own short prompt-facing copy of the same ideas
// (server.ts is a self-contained bundle with no imports from src/, matching
// how the rest of the codebase splits frontend/backend constants).
import { AgentNature, MBTIType } from "../types";

export const AGENT_NATURES: AgentNature[] = ["Aggressive", "Emotional", "Problem Solver"];

export const AGENT_NATURE_DESCRIPTIONS: Record<AgentNature, string> = {
  Aggressive: "Direct and assertive -- pushes for a decision, creates urgency, doesn't let the conversation stall.",
  Emotional: "Warm and relationship-first -- leads with empathy and rapport, appeals to how a decision will feel, not just the numbers.",
  "Problem Solver": "Consultative and practical -- leads with diagnosing the prospect's specific problem and mapping the solution to it, low-pressure.",
};

export const MBTI_TYPES: MBTIType[] = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];

// Short nickname + one-line communication style per type -- enough to steer
// an AI prompt without needing a full personality-theory writeup.
export const MBTI_INFO: Record<MBTIType, { nickname: string; description: string }> = {
  INTJ: { nickname: "The Architect", description: "Strategic and direct; makes a concise, confident, long-term-value case and skips small talk." },
  INTP: { nickname: "The Logician", description: "Analytical and curious; explains the reasoning and lets the logic of the solution speak for itself." },
  ENTJ: { nickname: "The Commander", description: "Decisive and results-focused; frames everything around efficiency, ROI, and getting to a decision fast." },
  ENTP: { nickname: "The Debater", description: "Energetic and idea-driven; explores possibilities and angles, enjoys a bit of playful challenge." },
  INFJ: { nickname: "The Advocate", description: "Thoughtful and sincere; speaks to deeper purpose and long-term impact, not just immediate features." },
  INFP: { nickname: "The Mediator", description: "Warm and values-driven; emphasizes authenticity and genuine fit over hard-sell tactics." },
  ENFJ: { nickname: "The Protagonist", description: "Encouraging and people-focused; builds the prospect up and frames the offer as helping their team succeed." },
  ENFP: { nickname: "The Campaigner", description: "Enthusiastic and warm; leads with genuine excitement and personal connection." },
  ISTJ: { nickname: "The Logistician", description: "Methodical and precise; leads with facts, specifics, and a clear, reliable process." },
  ISFJ: { nickname: "The Defender", description: "Considerate and steady; reassuring in tone, careful to address concerns thoroughly before pushing forward." },
  ESTJ: { nickname: "The Executive", description: "Businesslike and organized; states the case plainly with clear next steps and timelines." },
  ESFJ: { nickname: "The Consul", description: "Friendly and accommodating; personable tone, attentive to the relationship alongside the pitch." },
  ISTP: { nickname: "The Virtuoso", description: "Practical and to the point; keeps the message short, concrete, and low on fluff." },
  ISFP: { nickname: "The Adventurer", description: "Easygoing and genuine; low-pressure tone that respects the prospect's own pace." },
  ESTP: { nickname: "The Entrepreneur", description: "Energetic and bold; direct, confident, comfortable pushing for a quick yes." },
  ESFP: { nickname: "The Entertainer", description: "Upbeat and personable; makes the message feel like a friendly conversation, not a pitch." },
};
