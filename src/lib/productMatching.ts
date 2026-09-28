// Shared "who should we sell this to" matching logic for Products/Services.
// Used by both the Products page (to show live matching leads on a product
// record) and Email Marketing (to pre-select a campaign's audience from a
// chosen product). Keeping this in one place means the two features can
// never silently disagree on what "matches" means.
//
// Companies and Contacts no longer exist as entities in this CRM -- matching
// is Lead-only.
import { Lead, Product } from "../types";

function norm(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

// An empty criteria list means "no constraint on this field" -- a brand
// new product with nothing filled in matches everyone, rather than no one.
function matchesList(value: string | undefined | null, list: string[]): boolean {
  if (!list || list.length === 0) return true;
  if (!value) return false;
  const target = norm(value);
  return list.some((v) => norm(v) === target);
}

function matchesTags(tags: string[] | undefined, list: string[]): boolean {
  if (!list || list.length === 0) return true;
  if (!tags || tags.length === 0) return false;
  const normTags = tags.map(norm);
  return list.some((v) => normTags.includes(norm(v)));
}

export function leadMatchesProduct(lead: Lead, product: Product): boolean {
  const c = product.targetCriteria;
  return (
    matchesList(lead.industry, c.industries) &&
    matchesList(lead.clientCategory, c.clientCategories) &&
    matchesList(lead.country, c.countries) &&
    matchesList(lead.source, c.leadSources) &&
    matchesTags(lead.tags, c.tags)
  );
}

export interface ProductMatches {
  leads: Lead[];
}

export function computeProductMatches(
  product: Product,
  data: { leads: Lead[] }
): ProductMatches {
  return {
    leads: data.leads.filter((l) => leadMatchesProduct(l, product)),
  };
}

// A product with literally no target criteria set matches "everyone", which
// is technically correct but not a useful signal to show as "N matches" in
// the UI before the user has defined any targeting at all.
export function hasAnyTargetCriteria(product: Product): boolean {
  const c = product.targetCriteria;
  return Boolean(
    (c.industries && c.industries.length > 0) ||
      (c.clientCategories && c.clientCategories.length > 0) ||
      (c.companyStatuses && c.companyStatuses.length > 0) ||
      (c.countries && c.countries.length > 0) ||
      (c.tags && c.tags.length > 0) ||
      (c.leadSources && c.leadSources.length > 0)
  );
}
