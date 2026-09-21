// CEO Notes -- Aargard's CEO journal, broadcast read-only to every AarPex
// user across every workspace.
//
// This is deliberately NOT a database table users can write to: it's
// static content that ships with the app, exactly like
// src/data/releaseNotes.ts. Nobody sees a "New Entry"/Edit/Delete button
// anywhere in the app -- the only way a new entry goes live is by adding it
// here and publishing a build. Keep the newest entry first.

import { CeoNote } from "../types";

export const CEO_NOTES: CeoNote[] = [
  {
    id: "note_2026_09_21_local_businesses",
    title: "Built for the Businesses That Built America",
    content: `Supporting local businesses has never just been a line in our mission statement -- it's the reason Aargard exists. Every framework we've built, every tool we've shipped, started with one question: what does a local business actually need to compete and grow?

"Aargard: We don't just consult local businesses. We stand behind them."

That question has taken us further than I expected. We've now worked with 10,000+ local businesses across the USA through direct consultation -- a number that still doesn't feel real when I write it down, but it's ours, and it's just the beginning.

And we're not slowing down. More tools are coming. Our Business Ecosystem Intelligence framework -- the thing I've been quietly obsessing over for months -- is on its way, and it's going to change how local businesses understand the market around them.

If you're a small business owner reading this: don't wait for the framework to launch to get help. Opt in for a consultation now. We're also opening up mentorship and coaching sessions for small businesses across the USA -- real conversations, real guidance, no fluff.

Book a consultation: consultation.aargard.com

This page is where I'll keep sharing what's next -- new tools, new milestones, and everything in between.`,
    type: "Milestone",
    date: "2026-09-21",
    authorName: "Hamza Mazhar Sheikh",
    tags: ["local-businesses", "consultation", "mentorship", "milestone"],
    createdAt: "2026-09-21T00:00:00.000Z",
  },
];
