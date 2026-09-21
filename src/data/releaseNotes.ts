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
    version: "1.10.0",
    date: "2026-09-21",
    headline: "Straight From Aargard's CEO",
    tagline: "CEO Notes is now a shared broadcast -- one voice, every workspace, published directly by Aargard.",
    highlights: [
      {
        title: "One journal, every workspace",
        description: "CEO Notes now shows the same entries to every AarPex user, everywhere -- Aargard's real running log, not a per-account journal.",
      },
      {
        title: "Always authentic, never edited",
        description: "Entries are published directly by Aargard -- no one else can create, edit, or delete a CEO Notes entry from inside AarPex.",
      },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-09-21",
    headline: "Your Journal, Right On The Dashboard",
    tagline: "CEO Notes now lives front and center, in its own maroon and teal corner of home.",
    highlights: [
      {
        title: "No more digging through menus",
        description: "CEO Notes now shows up right on the Dashboard, next to What's New, with your latest entries at a glance.",
      },
      {
        title: "A look of its own",
        description: "A maroon, burgundy, teal, and black palette sets it apart as your personal corner of AarPex.",
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-09-21",
    headline: "Your Story, In Your Own App",
    tagline: "A running journal for the team that builds this with you -- write it yourself, or let AI help.",
    highlights: [
      {
        title: "CEO Notes: a real journal, not a status report",
        description: "Log reflections, milestones, and honest progress updates in a new dedicated section your team can read anytime.",
      },
      {
        title: "AI polishes your rough notes",
        description: "Jot a quick thought and AarPex turns it into a well-written entry in your own voice -- you review before it's ever published.",
      },
      {
        title: "Built for connection, not corporate-speak",
        description: "No dashboards, no metrics -- just your title, your words, and the date, the way a memoir should read.",
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-09-21",
    headline: "Your Copilot Can Actually Do The Work Now",
    tagline: "Tell the AI chat what you need and confirm it -- leads, deals, invoices, and more, handled in seconds.",
    highlights: [
      {
        title: "From Q&A to real action",
        description: "Ask your Sales Intelligence Copilot to create a lead, log an invoice, or update a deal, and it builds the record for you.",
      },
      {
        title: "You're always in control",
        description: "Every action shows up as a confirmation card first -- nothing changes in your CRM until you click Confirm.",
      },
      {
        title: "No guesswork, no wrong records",
        description: "The AI only acts on companies, contacts, and deals that actually exist in your workspace -- ambiguous requests get flagged instead of guessed.",
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-09-20",
    headline: "Sell The Right Thing To The Right People",
    tagline: "Define what you offer once, let AI target it, and watch the matching audience build itself.",
    highlights: [
      {
        title: "A home for everything you sell",
        description: "Agency retainers, SaaS plans, tour packages, one-off B2B products -- the new Products page handles all of it, set up by hand or drafted by AI from a plain-language description.",
      },
      {
        title: "AI knows who wants it",
        description: "Every product gets an AI-generated read on its ideal customer, plus pitch angles ready to drop straight into outreach.",
      },
      {
        title: "Your audience, always current",
        description: "Set tag-based targeting once and see a live count of exactly which companies, leads, and contacts match -- no manual list-building.",
      },
      {
        title: "Campaigns that already know the pitch",
        description: "Pick a product when building an email campaign and AarPex pre-selects the matching audience and writes the copy around that product's pitch.",
      },
    ],
  },
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
