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
    version: "1.18.0",
    date: "2026-09-24",
    headline: "Send WhatsApp Messages from Leads & Contacts",
    tagline: "Connect one WhatsApp Business number and message people straight from their record.",
    highlights: [
      {
        title: "WhatsApp Business, connected in Settings",
        description: "A new \"WhatsApp Business\" Settings tab connects your Meta WhatsApp phone number in a couple of fields, with a one-click Test Connection against Meta's own API.",
      },
      {
        title: "Message leads and contacts directly",
        description: "A new WhatsApp button on lead cards, contact rows, and company contact lists opens a compose window prefilled with that person's number -- sends log to the timeline just like email.",
      },
      {
        title: "Free text or template, your call",
        description: "WhatsApp only allows a free-text reply within 24 hours of the contact last messaging you -- outside that window the compose window switches you to a pre-approved template instead of just failing.",
      },
    ],
  },
  {
    version: "1.17.0",
    date: "2026-09-24",
    headline: "Standardized Industries & Client Categories",
    tagline: "A shared industry list, a new Client Category field, and product targeting that uses both.",
    highlights: [
      {
        title: "Real industry dropdowns, everywhere",
        description: "Companies and Leads now pick from a standard list of 25 industries in Quick Create (leads used to get silently stuck on \"Technology / SaaS\") -- with a custom option if yours isn't listed.",
      },
      {
        title: "New: Client Category",
        description: "Classify who a company or lead actually is -- Startup, SMB, Mid-Market, Enterprise, Government, and more -- independent of what industry they're in.",
      },
      {
        title: "Products can target by client category too",
        description: "The \"who should this be sold to\" targeting on Products now has chip pickers for both Industries and Client Categories, and AI-assisted product setup grounds its suggestions in the same standard lists.",
      },
    ],
  },
  {
    version: "1.16.0",
    date: "2026-09-24",
    headline: "Connect More Than One Mailbox",
    tagline: "Sales, support, or your own inbox -- send and track replies from whichever one fits, per email or per campaign.",
    highlights: [
      {
        title: "Multiple mailboxes per workspace",
        description: "Settings > Hostinger & Webmail now manages a list of mailboxes instead of one -- add, edit, disconnect, and pick a default, each with its own send (SMTP) and receive (IMAP) credentials.",
      },
      {
        title: "Choose the sender when it matters",
        description: "Composing a one-off email or building an Email Marketing campaign now lets you pick which connected mailbox sends it -- campaigns remember their choice for reply-tracking too.",
      },
    ],
  },
  {
    version: "1.15.0",
    date: "2026-09-23",
    headline: "Let AI Skim the Web to Build Your Knowledge Base",
    tagline: "Paste a link, get a drafted entry -- no more typing up notes from scratch.",
    highlights: [
      {
        title: "\"Generate from a link\" in every entry editor",
        description: "Paste a URL and AarPex fetches the page and drafts a title, summary, and tags for you -- review and tweak before saving.",
      },
      {
        title: "Framed for what you're actually looking at",
        description: "Paste a prospect's website for Company KB and it summarizes them; paste your own site for Product or Operator KB and it summarizes you.",
      },
    ],
  },
  {
    version: "1.14.1",
    date: "2026-09-23",
    headline: "Attach Knowledge Base Entries to Leads, Contacts & Companies",
    tagline: "The Knowledge Base categories now match how you actually work: per-record context, your own positioning, and what you sell.",
    highlights: [
      {
        title: "Company Knowledge Base now attaches to real records",
        description: "Write an entry once (e.g. \"Healthcare industry context\") and attach it to as many leads, contacts, or companies as it applies to, right from the entry editor.",
      },
      {
        title: "Operator Playbook now covers your own positioning",
        description: "Your background and service offering, and how it aligns with what you sell -- so the AI can help you position it to a specific lead or company. Still internal-only.",
      },
      {
        title: "The AI assistant knows who a note is about",
        description: "When a Company Knowledge Base entry is attached to specific records, the assistant sees exactly which ones by name -- so it can answer \"what do we know about Acme Corp\" accurately.",
      },
    ],
  },
  {
    version: "1.14.0",
    date: "2026-09-23",
    headline: "Introducing the Knowledge Base",
    tagline: "Teach the AI assistant who you are, what you sell, and how your team operates -- in your own words.",
    highlights: [
      {
        title: "Three Knowledge Bases, one place",
        description: "Company (who you are), Product & Service (what you sell), and a Dashboard Operator Playbook (internal SOPs and scripts, never shown to customers) -- write entries in plain text, organized and searchable.",
      },
      {
        title: "Your AI assistant now knows your business",
        description: "The floating chat assistant reads your Knowledge Base when answering questions or drafting things, so its answers reflect your actual positioning, offerings, and internal process -- not generic guesses.",
      },
      {
        title: "Jump straight there",
        description: "Ask the assistant to \"open the knowledge base\" or \"show me the playbook\" and it'll take you right there.",
      },
    ],
  },
  {
    version: "1.13.5",
    date: "2026-09-23",
    headline: "Bulk Syncs Are Now Bulletproof",
    tagline: "Large batches of leads, companies, and contacts now sync reliably from end to end -- and if anything ever can't save, you'll actually see it.",
    highlights: [
      {
        title: "One bad row can no longer sink a whole sync",
        description: "Syncing hundreds of records at once used to fail ALL of them if even a single row had a problem. Now records save in small batches with automatic retries, so a stray bad record only ever affects itself.",
      },
      {
        title: "Fixed a large-batch cleanup bug that could quietly drop records",
        description: "The background step that removes deleted records from the database could stumble on very large syncs (hundreds of companies or contacts at once), leaving some records missing after a sign-out/sign-in. That step is now built to handle any size safely.",
      },
      {
        title: "Sync problems now show up in your Audit Log",
        description: "If a record genuinely can't be saved, you'll see it in Settings > Audit Log with the specific reason, instead of it silently vanishing.",
      },
      {
        title: "New totals on the Contacts page",
        description: "See your total contact count, how many are reachable by email, and how many companies they represent, at a glance.",
      },
    ],
  },
  {
    version: "1.13.3",
    date: "2026-09-23",
    headline: "Your Data Now Actually Stays Saved",
    tagline: "Found and fixed the real reason synced leads, companies, and contacts could vanish -- sometimes right after they'd just been added.",
    highlights: [
      {
        title: "Fixed the data-loss bug behind the flash-then-empty screens",
        description: "A background sync step could, in a narrow timing window around sign-in or switching workspaces, delete every record in a table instead of just the ones that were actually removed. That window is now closed for good.",
      },
      {
        title: "Sign out no longer races your last save",
        description: "Every change syncs to the database in the background; signing out right after now waits for that save to finish first, instead of risking it never landing at all.",
      },
      {
        title: "Companies and contacts sync in the right order",
        description: "Fixed a timing issue where a new lead's link to a company or contact could try to save before the company or contact itself had finished -- now it always waits its turn.",
      },
      {
        title: "Pro tier limited to internal testing",
        description: "Everyone else's subscription picker now only offers Growth ($29/mo) while Pro finishes testing.",
      },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-09-22",
    headline: "Pro Plan Checkout, Phone Field Fix",
    tagline: "The Pro upgrade now collects real payment, and Company creation finally has a phone field.",
    highlights: [
      {
        title: "Upgrade to Pro, for real",
        description: "Choosing Pro in the subscription picker now sends you to Pro's own Stripe payment page instead of the Growth one.",
      },
      {
        title: "Phone number when adding a Company",
        description: "The Quick Create form for a new Company now has a phone field, matching Leads and Contacts.",
      },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-09-22",
    headline: "A New Pro Tier, A Longer Trial, A Fixed Sync",
    tagline: "More room to try AarPex, a Pro plan for growing teams, and a lead-sync bug squashed.",
    highlights: [
      {
        title: "14 days to explore, not 7",
        description: "Every new workspace now gets a full two weeks on the free trial before anything is charged.",
      },
      {
        title: "Introducing the Pro plan",
        description: "$99/mo unlocks multiple sending mailboxes and more -- see the upgrade picker in Settings for the full list.",
      },
      {
        title: "Sync All to Companies/Contacts now sticks",
        description: "Bulk-linking leads to Company and Contact records used to silently not save -- fixed, with a \"Linked\" badge so you can see it worked.",
      },
      {
        title: "Edit a company's phone number in place",
        description: "No more deleting and re-adding a company just to fix a typo'd phone number -- edit it right from the Company 360 view.",
      },
    ],
  },
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
