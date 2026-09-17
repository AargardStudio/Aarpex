import { Tenant } from "../types";

// No workspaces ship pre-loaded. Every tenant a user sees is one they
// created for real (via sign-up) or were invited into — nothing here is
// seeded automatically.
export const defaultTenants: Tenant[] = [];
