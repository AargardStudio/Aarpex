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
} from "lucide-react";

interface Section {
  icon: React.ElementType;
  title: string;
  body: string[];
  steps?: string[];
}

const SECTIONS: Section[] = [
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
      "Turn on an Industry Playbook (optional). Go to Industry Playbooks, open one matching your industry, and switch on auto-run if you want the AI agent to draft follow-ups for you.",
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
    title: "Industry Playbooks",
    body: [
      "A Playbook is a set of rules for one industry -- how often to follow up, what discount range is allowed, whether the AI can auto-run without you approving every message. Turn a playbook's auto-run on and the AI agent starts working that industry's leads/companies on its own schedule, always queuing anything it drafts into Agent Approvals first.",
      "Important: a Playbook does NOT have a \"select businesses\" step like an Email Marketing campaign does. Instead, it automatically works every Lead and Company whose Industry field matches the Playbook's industry name exactly. Which businesses that includes is shown live inside the Playbook's own form, under \"Matching Businesses\" -- you can uncheck any specific one you don't want the agent touching, right there.",
      "To put a business into a Playbook: open that Lead or Company's profile, find the Industry field (it has a small pencil icon next to it), and set it to match the Playbook's industry name. It'll then show up under that Playbook's \"Matching Businesses\" list automatically -- no separate step needed.",
    ],
  },
  {
    icon: Bot,
    title: "Running an AI-Agent-Managed Campaign",
    body: [
      "This is how you let the AI work a group of leads or companies on autopilot -- following up, replying, even offering discounts -- while you just approve what it drafts. Unlike an Email Marketing campaign, there's no audience-picker screen for this: the \"audience\" is simply every business tagged with the right Industry.",
    ],
    steps: [
      "Make sure the businesses you want included have the right Industry set. Open each Lead or Company's profile and set its Industry field (pencil icon next to it) to the exact industry name you'll use for the Playbook below. This is the step that's easy to miss -- without it, a business simply won't be worked by the agent.",
      "Open an Industry Playbook for that same industry (or create one). This is where you set the rules: how often to follow up, and whether/how much discount it's allowed to offer.",
      "Check the \"Matching Businesses\" list inside the Playbook form. It shows every Lead/Company that currently matches, live. Uncheck any specific ones you want to leave out -- everything else checked will be worked by the agent.",
      "Turn the playbook's auto-run switch on. From that point, the agent works every included lead/company on its own schedule -- no manual triggering needed. You can also toggle this from the floating AI chat bubble instead of clicking into the page.",
      "Nothing sends automatically. Every draft the agent writes -- a follow-up, a reply, a negotiation offer -- lands in Agent Approvals first, along with its reasoning (e.g. \"no response in 8 days, playbook cadence is every 7\").",
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

export const InstructionsView: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200 text-slate-100">
      <div className="bg-[#181b21] rounded-2xl p-4 sm:p-6 border border-[#2d323f] shadow-xl">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shrink-0">
            <LifeBuoy className="w-5 h-5 text-teal-400" />
          </span>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
              How AarPex Works
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              A plain-language guide to every section of your workspace. Click any topic to expand it.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#181b21] rounded-2xl border border-[#2d323f] shadow-lg divide-y divide-[#2d323f] overflow-hidden">
        {SECTIONS.map((section, idx) => {
          const Icon = section.icon;
          const isOpen = openIndex === idx;
          return (
            <div key={section.title}>
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
