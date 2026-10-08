import React, { useState } from "react";
import {
  LifeBuoy,
  ChevronDown,
  LayoutDashboard,
  UserCheck,
  Users,
  Building2,
  Briefcase,
  GitBranch,
  Receipt,
  CheckSquare,
  Sparkles,
  BookOpen,
  BookMarked,
  Bot,
  FolderOpen,
  Mail,
  Bell,
  Settings,
  Rocket,
  Search,
  MessageCircle,
  KeyRound,
  Wrench,
  Megaphone,
} from "lucide-react";

interface Section {
  icon: React.ElementType;
  title: string;
  body: string[];
  steps?: string[];
  group?: string;
}

const SECTIONS: Section[] = [
  {
    icon: KeyRound,
    group: "Setup guides",
    title: "Sign up and confirm your email",
    body: [
      "Creating an account takes about a minute. Your workspace name, industry and currency are remembered, so you won't be asked again after you confirm your email.",
    ],
    steps: [
      "Open the sign-up page and enter your name, work email, a password (at least 8 characters) and your workspace name.",
      "Click \"Create Account\". AarPex emails you a confirmation link from support@aargard.com.",
      "Open the email (check Spam or Promotions if it isn't in your inbox) and click the confirmation link. It brings you back to AarPex.",
      "Sign in. Your workspace is created with the details you entered -- just check them and click create.",
      "Didn't get the email? Use \"Resend confirmation email\" on the sign-in or sign-up screen.",
    ],
  },
  {
    icon: Mail,
    group: "Setup guides",
    title: "Connect your sending mailbox (Hostinger and others)",
    body: [
      "AarPex sends campaign emails and reads replies through your own mailbox, so messages come from your real address. Add it in Settings -> Mailboxes.",
      "Hostinger settings: sending (SMTP) host smtp.hostinger.com port 465 (SSL); receiving (IMAP) host imap.hostinger.com port 993 (SSL). The username is the full email address and the password is that mailbox's password.",
    ],
    steps: [
      "Create or confirm the mailbox in your email host (for Hostinger: hPanel -> Emails) and check you can open it in webmail.",
      "In AarPex go to Settings and add a mailbox: email address, display name, password, SMTP host and port.",
      "Click the test/verify button. If it fails, re-check the password and that port 465 (or 587) matches your host.",
      "Make it the default mailbox, or pick it per campaign in the campaign maker (\"Send From\").",
      "Ask your email host to set SPF, DKIM and DMARC for your domain. Without them, emails often land in spam.",
    ],
  },
  {
    icon: Megaphone,
    group: "Setup guides",
    title: "Email campaign maker -- all options",
    body: [
      "Email Marketing -> New Campaign walks you through 4 steps. Everything you choose is saved with the campaign.",
    ],
    steps: [
      "Name & Audience: name the campaign, choose Send From, optionally a Product and an Industry Agent, then tick the leads to include.",
      "Cadence: pick how often follow-ups go out (Daily, Weekly, Biweekly, Monthly or a custom number of days) and how many follow-ups (0 to 6). \"Skip weekends\" moves anything that would land on Saturday or Sunday to Monday.",
      "Technique & Style: choose a sales technique (or Mixed), a tone of voice, length (Short, Medium, Detailed), the call-to-action and optional link, and the subject-line style. \"More options\" adds language, campaign goal, extra instructions for the AI, a signature added to every email, an optional P.S. and emoji.",
      "Click \"Execute AI\" to write the whole sequence.",
      "Customize Emails: edit any email. You can change its technique and delay, insert {{firstName}} / {{company}} / {{jobTitle}} tags, add, duplicate or delete follow-ups, see word and subject-length counts, and preview exactly what a recipient sees.",
      "\"Improve this email with AI\": one-click changes (shorter, friendlier, more formal, stronger call-to-action, add urgency, simpler) or type your own instruction.",
      "\"Send a test to me\" emails the current email to your own address so you can check it before launch.",
      "Save as Draft to come back later, or Save & Send Now to send the first email and schedule the follow-ups.",
    ],
  },
  {
    icon: MessageCircle,
    group: "Setup guides",
    title: "WhatsApp (Meta Cloud API) setup",
    body: [
      "AarPex uses Meta's official WhatsApp Business Cloud API. Nothing is sent to a prospect without your approval.",
    ],
    steps: [
      "In Meta for Developers, create an app with the WhatsApp product and open WhatsApp -> API Setup.",
      "Copy the Phone number ID and a permanent access token into AarPex Settings -> WhatsApp, then click verify.",
      "While your number is in test mode, add each recipient under \"To\" in API Setup first, otherwise Meta returns error #131030.",
      "Use Settings -> WhatsApp -> Test send with the template hello_world to confirm it works.",
      "To receive replies, add the webhook callback https://aarpex.aarbook.com/api/whatsapp/webhook and your verify token in Meta, and subscribe to \"messages\".",
      "Outside the 24-hour reply window you can only send an approved template (error #131047). Inside it, normal messages work.",
      "Open the WhatsApp page to see chats, an unread folder, the \"Sent by agents\" folder, and to message any number.",
    ],
  },
  {
    icon: Wrench,
    group: "Admin (workspace owner)",
    title: "Sign-up emails: SMTP and redirect URLs",
    body: [
      "These are one-time settings in your Supabase project (Authentication). They control the confirmation email people get when they sign up.",
    ],
    steps: [
      "Authentication -> URL Configuration: set Site URL to https://aarpex.aarbook.com and add https://aarpex.aarbook.com/app and https://aarpex.aarbook.com/** to Redirect URLs.",
      "Authentication -> Emails -> SMTP Settings: enable custom SMTP. Sender email support@aargard.com, sender name AarPex, host smtp.hostinger.com, port 465, username support@aargard.com, and that mailbox's password.",
      "Raise Authentication -> Rate Limits if you expect many sign-ups per hour (custom SMTP starts at a low default).",
      "Make sure aargard.com has SPF, DKIM and DMARC records so confirmation emails reach the inbox.",
      "Test by signing up with a fresh email address and checking the email arrives and the link opens AarPex.",
    ],
  },
  {
    icon: Wrench,
    group: "Troubleshooting",
    title: "Common problems and fixes",
    body: [
      "Confirmation email didn't arrive: check Spam, use Resend confirmation email, and ask your admin to confirm custom SMTP is on.",
      "Confirmation link opens the wrong website: the Site URL in Supabase is wrong -- see \"Sign-up emails: SMTP and redirect URLs\".",
      "A lead isn't picked up by an Industry Agent: the lead's industry must match the agent's industry. Open the lead -> Edit details and choose the industry from the dropdown.",
      "Campaign emails fail to send: re-test the mailbox in Settings, and check the password and SMTP port.",
      "WhatsApp error #131030: the recipient isn't on your allowed list yet. Error #131047: the 24-hour window has closed -- use an approved template.",
      "AI writing fails or is blank: check the AI key under Settings, then try again; the campaign maker falls back to built-in templates if AI is unavailable.",
    ],
  },
  {
    icon: Rocket,
    title: "Getting Started (baby steps)",
    body: [
      "New to AarPex? Do these in order -- each one takes a couple of minutes and sets up the next.",
    ],
    steps: [
      "Add your first Company. Go to Companies -> \"Add Company\" and enter one customer you already work with.",
      "Add a Contact at that company. Go to Contacts -> \"Add Contact\" and link it to the company you just created.",
      "Create a Deal. Go to Deals -> \"Add Deal\", pick the company, and enter a dollar value -- this is your first sales opportunity.",
      "Turn on an Industry Agent (optional). Go to Industry Agents, open one matching your industry, and switch on auto-run if you want the AI agent to draft follow-ups for you.",
      "Allow browser notifications. When AarPex asks, click Allow -- this is how you'll be alerted the moment the AI drafts something that needs your approval.",
      "Check Agent Approvals. If the AI has drafted anything, review it on the Dashboard or the Agent Approvals page before it sends.",
      "Come back to this Instructions page any time you're unsure what a screen does.",
    ],
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    body: [
      "This is your home screen -- it opens every time you sign in. It shows your pipeline value, revenue collected, overdue invoices, and anything the AI agent has drafted and needs your approval.",
      "The \"What's New\" panel shows the latest features added to AarPex. Click \"See earlier updates\" to see the full history.",
      "If any AI agent has drafted a follow-up email, reply, or discount offer, it shows up in the Agent Approvals box right here -- click the green check to send it, or the red X to reject it. You don't have to leave this page.",
    ],
  },
  {
    icon: UserCheck,
    title: "Leads",
    body: [
      "A Lead is someone who might become a customer but hasn't been qualified yet. Add leads one at a time with \"Add Lead\", or upload a spreadsheet of many leads at once with the import button.",
      "Click into any lead to see its full profile: contact details, notes, AI-written summary, and history. You can convert a promising lead into a Company + Contact + Deal with one click once it's ready to move forward.",
    ],
  },
  {
    icon: Users,
    title: "Contacts",
    body: [
      "Contacts are the actual people you deal with at a company -- decision makers, day-to-day contacts, and so on.",
      "Use \"Import Contacts\" to bring in a spreadsheet of people. You can either create brand-new contacts from the file, or use it to update existing contacts (for example, refreshing everyone's phone numbers) by matching on email address.",
    ],
  },
  {
    icon: Building2,
    title: "Companies",
    body: [
      "Companies are the organizations you sell to. Every deal, invoice, and contact is linked to a company, so this is a good place to check the full picture on any customer -- their revenue, open deals, outstanding balance, and activity history.",
      "Companies can be imported or updated in bulk the same way as Contacts.",
    ],
  },
  {
    icon: Briefcase,
    title: "Deals",
    body: [
      "A Deal is a specific sales opportunity with a dollar value, a stage, and an expected close date. Deals move through your Pipeline stage by stage until they're marked Won or Lost.",
      "Deals can also be imported or bulk-updated from a spreadsheet, matched by deal name.",
    ],
  },
  {
    icon: GitBranch,
    title: "Pipelines",
    body: [
      "This is the visual board view of all your open Deals, grouped by stage (like \"Discovery\", \"Proposal Sent\", \"Negotiation\"). Drag a deal card to a new column to move it forward.",
    ],
  },
  {
    icon: Receipt,
    title: "Invoices & Payments",
    body: [
      "Invoices track what you've billed a customer. Payments track what's actually been collected. Any invoice past its due date with a remaining balance shows up as \"overdue\" on your Dashboard and in the alert bell at the top of the screen.",
    ],
  },
  {
    icon: CheckSquare,
    title: "Tasks",
    body: [
      "Tasks are your to-do list -- follow-up calls, reminders, anything with a due date. High-priority tasks that aren't done yet show up on your Dashboard and in the alert bell.",
    ],
  },
  {
    icon: Sparkles,
    title: "AI Insights",
    body: [
      "This is where AarPex's AI analyzes your whole book of business -- deals at risk, upsell opportunities, and a written daily briefing you can regenerate any time.",
    ],
  },
  {
    icon: BookOpen,
    title: "Knowledge Base",
    body: [
      "This is background material the AI reads before it writes anything on your behalf -- company facts, product details, pricing rules, or notes about a specific lead or contact. The more accurate detail you keep here, the smarter the AI's drafts and summaries will be.",
      "You can add entries by hand, or send a file from the File Manager straight into the Knowledge Base.",
    ],
  },
  {
    icon: BookMarked,
    title: "Industry Agents",
    body: [
      "An Agent is a set of rules for one industry -- how often to follow up, what discount range is allowed, whether the AI can auto-run without you approving every message. Turn an agent's auto-run on and the AI agent starts working that industry's leads/companies on its own schedule, always queuing anything it drafts into Agent Approvals first.",
      "Important: an Agent does NOT have a \"select businesses\" step like an Email Marketing campaign does. Instead, it automatically works every Lead and Company whose Industry field matches the Agent's industry name exactly. Which businesses that includes is shown live inside the Agent's own form, under \"Matching Businesses\" -- you can uncheck any specific one you don't want the agent touching, right there.",
      "To put a business into an Agent: open that Lead or Company's profile, find the Industry field (it has a small pencil icon next to it), and set it to match the Agent's industry name. It'll then show up under that Agent's \"Matching Businesses\" list automatically -- no separate step needed.",
    ],
  },
  {
    icon: Bot,
    title: "Running an AI-Agent-Managed Campaign",
    body: [
      "This is how you let the AI work a group of leads or companies on autopilot -- following up, replying, even offering discounts -- while you just approve what it drafts. Unlike an Email Marketing campaign, there's no audience-picker screen for this: the \"audience\" is simply every business tagged with the right Industry.",
    ],
    steps: [
      "Make sure the businesses you want included have the right Industry set. Open each Lead or Company's profile and set its Industry field (pencil icon next to it) to the exact industry name you'll use for the Agent below. This is the step that's easy to miss -- without it, a business simply won't be worked by the agent.",
      "Open an Industry Agent for that same industry (or create one). This is where you set the rules: how often to follow up, and whether/how much discount it's allowed to offer.",
      "Check the \"Matching Businesses\" list inside the Agent form. It shows every Lead/Company that currently matches, live. Uncheck any specific ones you want to leave out -- everything else checked will be worked by the agent.",
      "Turn the agent's auto-run switch on. From that point, the agent works every included lead/company on its own schedule -- no manual triggering needed. You can also toggle this from the floating AI chat bubble instead of clicking into the page.",
      "Nothing sends automatically. Every draft the agent writes -- a follow-up, a reply, a negotiation offer -- lands in Agent Approvals first, along with its reasoning (e.g. \"no response in 8 days, agent cadence is every 7\").",
      "Review and decide. Approve & Send if the draft looks right, or Reject if it doesn't -- you can do this from the Agent Approvals page, the Dashboard's Agent Approvals card, or the alert bell at the top of the screen.",
      "Keep a browser tab open. The agent currently scans for new work while a tab is open (roughly every 10 minutes) -- it isn't a fully server-side background process yet, so someone on the team needs AarPex open somewhere for it to keep running.",
    ],
  },
  {
    icon: Bot,
    title: "Agent Approvals",
    body: [
      "Every message the AI agent wants to send -- a follow-up, a reply, a discount offer -- lands here first. Nothing goes out without you (or whoever you've given permission) clicking Approve. Reject it instead and it's discarded.",
      "You'll see pending items here, on the Dashboard, and as a bell notification at the top of the screen so nothing sits unnoticed.",
    ],
  },
  {
    icon: FolderOpen,
    title: "File Manager",
    body: [
      "Upload and store any file -- PDFs, spreadsheets, images, documents. Storage space is limited based on your plan (shown as a usage bar at the top of the page).",
      "From here you can: add a file's contents to the Knowledge Base so the AI can reference it, or use a spreadsheet file to bulk-create or bulk-update Contacts, Companies, or Deals without re-uploading it elsewhere.",
    ],
  },
  {
    icon: Mail,
    title: "Email Marketing & Inbox",
    body: [
      "Email Marketing lets you build multi-step email campaigns targeting your Leads or Contacts. The Inbox shows which recipients have replied, so you know who's engaged.",
    ],
  },
  {
    icon: Bell,
    title: "Notifications & Alerts",
    body: [
      "The bell icon at the top of every screen shows anything that needs attention right now: overdue invoices, high-priority tasks, at-risk accounts, and pending Agent Approvals. Click any item to jump straight to it.",
      "If your browser asks for permission to show notifications, allow it -- that way you'll get a desktop alert the moment the AI agent drafts something new, even if AarPex isn't the tab you're looking at.",
    ],
  },
  {
    icon: Settings,
    title: "Settings",
    body: [
      "Manage your workspace, team members and their permissions, connected mailboxes, billing plan, and storage. This is also where you'll find your subscription tier and usage limits.",
    ],
  },
];

const GROUP_ORDER = ["Using AarPex", "Setup guides", "Admin (workspace owner)", "Troubleshooting"];
SECTIONS.forEach((sec) => {
  if (!sec.group) sec.group = "Using AarPex";
});

export const InstructionsView: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(() => Math.max(0, SECTIONS.findIndex((x) => x.title.startsWith("Getting Started"))));
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = SECTIONS.map((section, idx) => ({ section, idx }))
    .sort((a, b) => GROUP_ORDER.indexOf(a.section.group!) - GROUP_ORDER.indexOf(b.section.group!) || a.idx - b.idx)
    .filter(({ section }) =>
    !q ||
    [section.title, ...section.body, ...(section.steps || [])].join(" ").toLowerCase().includes(q)
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200 text-slate-100">
      <div className="bg-[#181b21] rounded-2xl p-4 sm:p-6 border border-[#2d323f] shadow-xl">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
            <LifeBuoy className="w-5 h-5 text-teal-400" />
          </span>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
              Docs &amp; Guides
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Setup instructions, how-tos and troubleshooting for every part of AarPex. Search, or click any topic to expand it.
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the docs (e.g. SMTP, WhatsApp, campaign, industry)…"
          className="w-full pl-9 pr-3 py-2.5 bg-[#181b21] border border-[#2d323f] text-white rounded-xl text-xs focus:outline-none focus:border-teal-400"
        />
      </div>

      {visible.length === 0 && (
        <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] p-6 text-center text-xs text-slate-400">
          Nothing matches "{query}". Try a simpler word, or ask the chat bubble in the bottom-right corner.
        </div>
      )}

      <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-lg divide-y divide-[#2d323f] overflow-hidden">
        {visible.map(({ section, idx }, vi) => {
          const Icon = section.icon;
          const isOpen = q ? true : openIndex === idx;
          const prevGroup = vi > 0 ? visible[vi - 1].section.group : undefined;
          return (
            <div key={section.title}>
              {section.group && section.group !== prevGroup && (
                <div className="px-4 py-2 bg-[#14171d] text-[10px] font-bold uppercase tracking-wider text-teal-400/80">
                  {section.group}
                </div>
              )}
              <button
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-[#1c2027] transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-[#252a36] border border-[#3d4455] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-teal-400" />
                  </span>
                  <span className="font-bold text-sm text-white truncate">{section.title}</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pl-[3.75rem] space-y-2 animate-in fade-in duration-150">
                  {section.body.map((p, i) => (
                    <p key={i} className="text-xs text-slate-300 leading-relaxed">
                      {p}
                    </p>
                  ))}
                  {section.steps && (
                    <ol className="space-y-1.5 pt-1">
                      {section.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                          <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 text-[10px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-teal-950/30 border border-teal-800/40 rounded-2xl p-4 text-xs text-teal-100/80 leading-relaxed">
        Still stuck on something? Use the floating chat bubble in the bottom-right corner of any screen -- you can ask
        it questions in plain English, and it can even take actions for you (like approving an agent action or
        drafting an email) after you confirm.
      </div>
    </div>
  );
};
