// Industry is a freeform text field (Leads, Companies, and Industry
// Playbooks all just store whatever string was typed/selected), and an
// Industry Playbook's whole matching mechanism is comparing that text
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
// normalizeIndustry() is the one place that comparison logic lives now;
// every place in the app that decides whether an Industry Playbook applies
// to a Lead/Company (or looks one up by industry) should compare
// normalizeIndustry(a) === normalizeIndustry(b) rather than rolling its own
// trim/lowercase.
export function normalizeIndustry(value: string | undefined | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
