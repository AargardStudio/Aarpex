// Marketed release notes for the Dashboard's "What's New in AarPex" panel.
//
// This is the customer-facing, punchy version of CHANGELOG.md -- write
// for someone deciding whether AarPex is worth their attention, not for
// a developer skimming a diff. Keep the newest release first.
//
// Per CLAUDE.md's versioning convention: every time a change is made and
// published, add (or extend) an entry here alongside the CHANGELOG.md
// entry and the VERSION/package.json bump, in the same commit.

export interface ReleaseHighlight {
  title: string;
  description: string;
}

export interface ReleaseNote {
  version: string;
  date: string; // YYYY-MM-DD
  headline: string;
  tagline: string;
  highlights: ReleaseHighlight[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.6.0",
    date: "2026-09-20",
    headline: "Never Miss What's New",
    tagline: "Every update, front and center on your dashboard -- the moment it ships.",
    highlights: [
      {
        title: "Built-in release radar",
        description: "A live \"What's New\" panel on your dashboard surfaces every AarPex update as it goes out, in plain English.",
      },
      {
        title: "Full history, one click away",
        description: "Curious what changed last week? Expand the panel for the complete story on everything AarPex has shipped.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-09-20",
    headline: "AarPex, Now In Your Pocket",
    tagline: "The whole CRM, reimagined for phone and tablet -- no pinching, no sideways scrolling.",
    highlights: [
      {
        title: "A dashboard built for your hand",
        description: "Pipeline, leads, invoices -- every screen flexes perfectly to phone and tablet screens.",
      },
      {
        title: "One-thumb navigation",
        description: "A sleek slide-out menu puts your entire CRM one tap away, wherever you're standing.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-09-20",
    headline: "Your New AI Sales Command Center",
    tagline: "Every lead now builds its own business intelligence -- automatically, in the background.",
    highlights: [
      {
        title: "Instant business profiles",
        description: "Add a lead and AarPex quietly builds the company record, contact card, and an AI health analysis for you.",
      },
      {
        title: "An AI teammate in the corner",
        description: "Ask AarPex anything or tell it where to go -- a chat bubble on every screen answers and jumps you straight there.",
      },
      {
        title: "Know the moment they reply",
        description: "The new Inbox watches your email campaigns and stops follow-ups the second someone responds. No more tone-deaf emails.",
      },
      {
        title: "Link any lead, instantly",
        description: "Connect a lead to an existing company and contact -- or sync your whole lead list at once -- in a single click.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-09-19",
    headline: "Start Selling in Seconds",
    tagline: "No card, no checkout page -- just a 7-day trial from the moment you sign up.",
    highlights: [
      {
        title: "Zero-friction onboarding",
        description: "New workspaces skip the payment page entirely and land straight on a full 7-day free trial.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-19",
    headline: "Outreach That Writes Itself",
    tagline: "AI-crafted email campaigns, built in minutes, not afternoons.",
    highlights: [
      {
        title: "AI email marketing",
        description: "Launch on-brand, AI-generated outreach sequences to your leads and contacts without writing a single line yourself.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-19",
    headline: "Your Data, Always Where You Left It",
    tagline: "Rock-solid workspaces that never quietly lose a beat.",
    highlights: [
      {
        title: "Bulletproof workspaces",
        description: "Every account now runs on a real, fully-synced workspace from the first sign-in -- nothing lives only in your browser anymore.",
      },
    ],
  },
];
