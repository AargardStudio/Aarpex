# AarPex CRM - Multi-Tenant Enterprise Cloud Platform

A modern, high-performance Multi-Tenant Enterprise CRM & Business Operations Suite built for **Aargard Business Solutions**.

## Features
- **Multi-Tenant Architecture**: Complete tenant isolation with PostgreSQL Row-Level Security (RLS) and customizable tenant workspaces.
- **Billing & Subscriptions**: Tiered subscription plans (Starter, Growth, Enterprise) with Stripe payment integration, auto-calculated annual discounts, and invoice tracking.
- **CRM Engine**: Comprehensive Pipeline tracking, Deal forecasting, Contact management, Company 360° analytics, and Lead conversion workflows.
- **Enterprise Integrations**:
  - Centralized Supabase PostgreSQL cloud database with RLS policies.
  - Per-tenant Stripe Payment Rails for live payments.
  - Per-tenant Hostinger & Webmail SMTP integration for transaction receipts & client correspondence.
- **AI-Powered Insights**: AI-driven account health scoring, smart lead conversion suggestions, and deal velocity analytics.

## Getting Started

### Prerequisites
- Node.js 18+ or 20+
- npm or bun

### Installation
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (copy from .env.example)
cp .env.example .env

# 3. Start development server
npm run dev
```

The application dev server runs on `http://localhost:3000`.

### Production Build
```bash
npm run build
npm start
```

## Project Structure
- `/src/components`: UI components (views, modals, common header, sidebar, footer).
- `/src/context`: React Context state providers (CRMContext, multi-tenant state).
- `/src/config`: Platform configurations (Supabase master database, Stripe defaults).
- `/src/data`: Schema definitions, seed mock data, and subscription plans.
- `/server.ts`: Express backend handling API routes, Stripe sessions, SMTP verification, and project archive packaging.

---
© 2026 Aargard Business Solutions. All rights reserved.
