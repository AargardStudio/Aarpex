import React from "react";
import { CRMProvider, useCRM } from "./context/CRMContext";
import { Sidebar } from "./components/common/Sidebar";
import { Header } from "./components/common/Header";
import { Footer } from "./components/common/Footer";
import { DashboardView } from "./components/views/DashboardView";
import { LeadsView } from "./components/views/LeadsView";
import { DealsView } from "./components/views/DealsView";
import { CompaniesView } from "./components/views/CompaniesView";
import { ContactsView } from "./components/views/ContactsView";
import { PipelinesView } from "./components/views/PipelinesView";
import { ActivitiesView } from "./components/views/ActivitiesView";
import { TasksView } from "./components/views/TasksView";
import { InvoicesView } from "./components/views/InvoicesView";
import { PaymentsView } from "./components/views/PaymentsView";
import { RevenueView } from "./components/views/RevenueView";
import { StripeView } from "./components/views/StripeView";
import { AiInsightsView } from "./components/views/AiInsightsView";
import { EmailMarketingView } from "./components/views/EmailMarketingView";
import { ProductsView } from "./components/views/ProductsView";
import { CeoNotesView } from "./components/views/CeoNotesView";
import { InboxView } from "./components/views/InboxView";
import { ReportsView } from "./components/views/ReportsView";
import { SettingsView } from "./components/views/SettingsView";
import { Company360Drawer } from "./components/company/Company360Drawer";
import { QuickCreateModal } from "./components/modals/QuickCreateModal";
import { UserAccessControlModal } from "./components/auth/UserAccessControlModal";
import { WorkspaceModal } from "./components/modals/WorkspaceModal";
import { AuthPage } from "./components/auth/AuthPage";
import { EmailComposeModal } from "./components/modals/EmailComposeModal";
import { FloatingAIChat } from "./components/common/FloatingAIChat";

const CRMMainContent: React.FC = () => {
  const {
    activeNav,
    isAuthPageOpen,
    setAuthPageOpen,
    authPageMode,
    isBootstrapping,
    isEmailComposeOpen,
    setEmailComposeOpen,
    emailComposeProps,
    tenants,
  } = useCRM();

  // While the initial Supabase session check is in flight, render nothing
  // rather than flash either the sign-in page or (worse) the app shell
  // before we actually know whether the visitor is authenticated.
  if (isBootstrapping) {
    return (
      <div className="min-h-screen w-full bg-[#0d0f12] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthPageOpen) {
    return (
      <AuthPage
        defaultMode={authPageMode}
        onSuccess={() => setAuthPageOpen(false)}
      />
    );
  }

  // Signed in, but this account has no real (database-backed) workspace
  // yet. Previously this fell through to the full app shell, which looked
  // and behaved exactly like a normal, working workspace -- it was
  // actually a local-only placeholder ("Workspace") that never synced to
  // Supabase, so anything entered here quietly lived only in this one
  // browser and could vanish on the next sign-in. Block the whole app
  // behind a mandatory "create your workspace" screen instead: no
  // dashboard, sidebar, or any other view is reachable until a real tenant
  // exists. CRMContext's session-bootstrap effect already forces
  // isCreateTenantModalOpen open the moment it confirms zero tenants; this
  // is what keeps it open and un-dismissible instead of letting it be
  // closed into the old fake-workspace state.
  if (tenants.length === 0) {
    return (
      <div className="min-h-screen w-full bg-[#0d0f12] flex items-center justify-center p-4">
        <WorkspaceModal mandatory />
      </div>
    );
  }

  const renderActiveView = () => {
    const key = (activeNav || "").toLowerCase().replace(/[\s-_]+/g, "");
    switch (key) {
      case "dashboard":
        return <DashboardView />;
      case "leads":
        return <LeadsView />;
      case "deals":
        return <DealsView />;
      case "companies":
        return <CompaniesView />;
      case "contacts":
        return <ContactsView />;
      case "pipelines":
        return <PipelinesView />;
      case "activities":
        return <ActivitiesView />;
      case "tasks":
        return <TasksView />;
      case "invoices":
        return <InvoicesView />;
      case "payments":
        return <PaymentsView />;
      case "revenue":
        return <RevenueView />;
      case "stripe":
        return <StripeView />;
      case "aiinsights":
        return <AiInsightsView />;
      case "emailmarketing":
        return <EmailMarketingView />;
      case "products":
        return <ProductsView />;
      case "ceonotes":
        return <CeoNotesView />;
      case "inbox":
        return <InboxView />;
      case "reports":
        return <ReportsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f1115] font-sans text-slate-100 antialiased">
      {/* Structural Navigation Sidebar */}
      <Sidebar />

      {/* Main Workspace Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-[#0f1115]">
        {/* Global Action Header & AI Search */}
        <Header />

        {/* Scrollable View Canvas */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-[#0f1115] custom-scrollbar flex flex-col justify-between">
          <div className="mx-auto max-w-7xl w-full flex-1">
            {renderActiveView()}
          </div>
          <div className="mx-auto max-w-7xl w-full">
            <Footer />
          </div>
        </main>
      </div>

      {/* Slide-over 360° Account Intelligence Drawer */}
      <Company360Drawer />

      {/* Global Quick Record Creation Modal */}
      <QuickCreateModal />

      {/* Controlled User Access & RBAC Modal */}
      <UserAccessControlModal />

      {/* Multi-Tenant Workspace Creation Modal */}
      <WorkspaceModal />

      {/* Global Multiple Mail Attachment Composer Modal */}
      <EmailComposeModal
        isOpen={isEmailComposeOpen}
        onClose={() => setEmailComposeOpen(false)}
        initialTo={emailComposeProps.to}
        initialSubject={emailComposeProps.subject}
        initialBody={emailComposeProps.body}
        initialAttachments={emailComposeProps.attachments}
        companyId={emailComposeProps.companyId}
        contactId={emailComposeProps.contactId}
        dealId={emailComposeProps.dealId}
      />

      {/* Floating AI Chat -- available on every signed-in screen */}
      <FloatingAIChat />
    </div>
  );
};

export default function App() {
  return (
    <CRMProvider>
      <CRMMainContent />
    </CRMProvider>
  );
}
