// Shared "who should we sell this to" matching logic for Products/Services.
// Used by both the Products page (to show live matching companies/leads/
// contacts on a product record) and Email Marketing (to pre-select a
// campaign's audience from a chosen product). Keeping this in one place
// means the two features can never silently disagree on what "matches"
// means.
import { Company, Contact, Lead, Product } from "../types";

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

export function companyMatchesProduct(company: Company, product: Product): boolean {
  const c = product.targetCriteria;
  return (
    matchesList(company.industry, c.industries) &&
    matchesList(company.clientCategory, c.clientCategories) &&
    matchesList(company.country, c.countries) &&
    (!c.companyStatuses || c.companyStatuses.length === 0 || c.companyStatuses.includes(company.status)) &&
    matchesTags(company.tags, c.tags)
  );
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

export function contactMatchesProduct(contact: Contact, product: Product, companies: Company[]): boolean {
  const c = product.targetCriteria;
  const company = companies.find((co) => co.id === contact.companyId);
  return (
    matchesList(company?.industry, c.industries) &&
    matchesList(company?.clientCategory, c.clientCategories) &&
    matchesList(contact.country, c.countries) &&
    matchesList(contact.leadSource, c.leadSources) &&
    matchesTags(contact.tags, c.tags)
  );
}

export interface ProductMatches {
  companies: Company[];
  leads: Lead[];
  contacts: Contact[];
}

export function computeProductMatches(
  product: Product,
  data: { companies: Company[]; leads: Lead[]; contacts: Contact[] }
): ProductMatches {
  return {
    companies: data.companies.filter((co) => companyMatchesProduct(co, product)),
    leads: data.leads.filter((l) => leadMatchesProduct(l, product)),
    contacts: data.contacts.filter((ct) => contactMatchesProduct(ct, product, data.companies)),
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
