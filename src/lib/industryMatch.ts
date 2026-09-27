// Industry is a freeform text field (Leads, Companies, and Industry
// Agents all just store whatever string was typed/selected), and an
// Industry Agent's whole matching mechanism is comparing that text
// against a business's Industry field. A plain `.trim().toLowerCase()`
// comparison -- which is what every call site used to do independently --
// still fails on things a person can't see or reasonably guard against by
// eye: a double space where the words are joined ("Car  Wash" vs
// "Car Wash"), a stray tab, or other run of whitespace typed or pasted in
// by accident. HTML normally collapses runs of whitespace when *displaying*
// text, so two values that read identically on screen can still differ
// once actually compared -- exactly the "I fixed it, it's definitely
// correct" bug report this was written to stop happening again.
//
// A second, sneakier class of the same bug: characters that are invisible
// but are NOT whitespace as far as JS's `\s` is concerned, so `.trim()` and
// `\s+` collapsing never touch them -- a zero-width space (U+200B), a
// zero-width joiner/non-joiner, a bidi control character, a soft hyphen,
// etc. Copy-pasting industry text out of a spreadsheet, PDF, or web page is
// a common way for one of these to end up in a single record's Industry
// field while every other record (typed by hand) doesn't have it. The two
// values can be pixel-identical on screen, byte-identical in length to the
// eye, and still never match -- which is exactly the shape of bug that
// survived two previous whitespace-only fixes here. INVISIBLE_CHARS_RE
// strips those out explicitly; NFKC normalization additionally folds
// visually-identical Unicode variants (fullwidth forms, some ligatures)
// that a straight lowercase/trim wouldn't unify either.
//
// normalizeIndustry() is the one place that comparison logic lives now;
// every place in the app that decides whether an Industry Agent applies
// to a Lead/Company (or looks one up by industry) should compare
// normalizeIndustry(a) === normalizeIndustry(b) rather than rolling its own
// trim/lowercase.
const INVISIBLE_CHARS_RE = /[​-‏‪-‮⁠-⁩﻿­]/g;

export function normalizeIndustry(value: string | undefined | null): string {
  return (value || "")
    .normalize("NFKC")
    .replace(INVISIBLE_CHARS_RE, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Applied at SAVE time -- everywhere a person types an Industry value into a
// free-text field (an Industry Agent's Industry, or a Lead/Company's own
// Industry field) -- so the string that actually gets stored is clean, not
// just the comparison normalizeIndustry() produces on the fly. This matters
// beyond matching: an Industry Agent's own `industry` field is also compared
// by *exact* string equality in a couple of places (e.g. stamping/filtering
// AgentAction records), so a value that silently carries an invisible
// character forever would still cause subtler drift even though
// normalizeIndustry() keeps the Lead/Company matching itself working.
// Deliberately preserves case (this is the stored/displayed value, not the
// lowercase comparison key normalizeIndustry() produces).
export function sanitizeIndustryText(value: string): string {
  return (value || "")
    .normalize("NFKC")
    .replace(INVISIBLE_CHARS_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Small edit-distance helper, used only to power "did you mean" suggestions
// below -- not part of the matching logic itself.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export interface IndustryUsage {
  raw: string; // the exact string as it's actually stored on a real record
  count: number;
}

// Collapses a list of raw Industry strings (as they actually appear on real
// Leads/Companies right now) into one entry per distinct normalized value,
// keeping the first exact spelling seen plus a usage count. This is what
// lets the Industry Agent form offer "pick an existing industry" instead of
// asking someone to re-type a value from memory and hope it matches
// byte-for-byte -- the exact bug class normalizeIndustry() above exists to
// catch, but picking beats re-typing every time.
export function summarizeIndustryUsage(values: (string | undefined | null)[]): IndustryUsage[] {
  const byKey = new Map<string, IndustryUsage>();
  for (const value of values) {
    const raw = (value || "").trim();
    if (!raw) continue;
    const key = normalizeIndustry(raw);
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { raw, count: 1 });
  }
  return Array.from(byKey.values()).sort((a, b) => b.count - a.count);
}

// Finds existing Industry values that are close, but not identical, to the
// one just typed -- the fallback for "I typed this exactly and it's still
// not matching". Either one is a substring of the other (normalized), or
// they're within edit-distance 2 (catches a stray/missing/extra character
// that isn't whitespace, which normalizeIndustry alone can't catch).
export function findCloseIndustryMatches(target: string, usages: IndustryUsage[]): IndustryUsage[] {
  const targetNorm = normalizeIndustry(target);
  if (!targetNorm) return [];
  return usages.filter((u) => {
    const n = normalizeIndustry(u.raw);
    if (n === targetNorm) return false; // exact matches aren't "close", they already match
    if (n.includes(targetNorm) || targetNorm.includes(n)) return true;
    return levenshtein(n, targetNorm) <= 2;
  });
}
