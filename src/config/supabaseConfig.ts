/**
 * Central Platform Database Configuration for AarPex by Aargard Business Solutions
 * 
 * IMPORTANT ARCHITECTURAL DIRECTIVE:
 * The Supabase URL, anon key, and database connection strings are intentionally NOT
 * customizable inside the tenant settings UI.
 * 
 * Tenants cannot modify the Supabase URL or master database endpoints.
 * It is configured once here and maintained directly through chat / system admin.
 * 
 * The Stripe Keys and SMTP Host settings REMAIN customizable per-tenant in Settings.
 */

export interface SupabasePlatformConfig {
  /**
   * The Supabase Project URL (e.g. https://xyzcompany.supabase.co)
   */
  projectUrl: string;
  /**
   * The Supabase Public / Anon API Key
   */
  anonKey: string;
  /**
   * The Supabase Service Role Secret Key (Optional - server-side admin)
   */
  serviceRoleKey: string;
  /**
   * Direct PostgreSQL Connection String (Optional - migrations & RLS)
   */
  databaseUrl: string;
  /**
   * Status of the master database connection
   */
  status: "configured" | "pending_credentials";
  /**
   * Platform host identifier
   */
  managedBy: string;
}

// EDIT THIS OBJECT WHEN PROVIDING YOUR SUPABASE CREDENTIALS IN CHAT:
export const MASTER_SUPABASE_CONFIG: SupabasePlatformConfig = {
  // Replace these values anytime in chat when you are ready to connect your live Supabase instance:
  projectUrl: "https://kjczjodwaikbkbljfhej.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqY3pqb2R3YWlrYmtibGpmaGVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzE1NDUsImV4cCI6MjEwNTA0NzU0NX0.wpza7cg8Kn024smE7wmsj_9lQD0B7a8U3asVLGa5Mjg",
  // Not provided yet — only needed for server-side admin operations (bypassing RLS).
  // Real user sign-up/sign-in works with just the anon key above.
  serviceRoleKey: "",
  databaseUrl: "postgresql://postgres:[PASSWORD]@db.kjczjodwaikbkbljfhej.supabase.co:5432/postgres",
  status: "configured",
  managedBy: "Aargard Business Solutions Master Infrastructure",
};
