// Standardized industry and client-category picklists used across AarPex --
// Company/Lead records, Product targeting, and AI grounding all draw from
// the same two lists so "Healthcare" typed in one place matches "Healthcare"
// typed in another. Both lists are deliberately broad (an agency/consultancy
// selling across verticals, not a single-industry vertical SaaS), and every
// picker built on them still allows a custom value for anything not listed
// -- these are suggestions, not a hard enum, so existing free-text data
// keeps working unchanged.
export const INDUSTRIES: string[] = [
  "Technology / SaaS",
  "Textile & Fashion",
  "Retail & Ecommerce",
  "Travel & Hospitality",
  "Real Estate & Property Management",
  "Security Services",
  "Cleaning & Facilities Services",
  "Healthcare & Wellness",
  "Financial Services & Bookkeeping",
  "Professional Services & Consulting",
  "Legal Services",
  "Marketing & Advertising Agency",
  "Construction & Trades",
  "Manufacturing & Industrial",
  "Logistics & Transportation",
  "Food & Beverage",
  "Education & Training",
  "Nonprofit & NGO",
  "Government & Public Sector",
  "Automotive",
  "Energy & Utilities",
  "Media & Entertainment",
  "Telecommunications",
  "Agriculture",
  "Wholesale & Distribution",
  "Other",
];

export const CLIENT_CATEGORIES: string[] = [
  "Startup",
  "Small Business / SMB",
  "Mid-Market",
  "Enterprise",
  "Franchise / Multi-Location",
  "Government / Public Sector",
  "Nonprofit / NGO",
  "Reseller / Channel Partner",
  "Individual / Consumer",
  "Other",
];
