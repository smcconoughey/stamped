# Stamped — Task Tracker

Last updated: 2026-03-12

## Status Legend
- [x] Done
- [~] In progress / partially done
- [ ] Not started

---

## Phase 1 — Recovery (Target: 2 months)

### Infrastructure
- [x] Next.js project scaffold
- [x] Prisma schema (SQLite dev / PostgreSQL prod)
- [x] Authentication (credentials provider)
- [x] Sidebar navigation + layout
- [x] render.yaml (Render deployment blueprint)
- [x] Health check endpoint (/api/health)
- [~] Microsoft Azure AD SSO — **needs Azure app registration**
      Steps:
      1. Go to portal.azure.com → Azure Active Directory → App registrations → New
      2. Name: "Stamped Purchasing"
      3. Supported account types: "Accounts in this organizational directory only" (or multitenant for enterprise)
      4. Redirect URI: https://your-app.onrender.com/api/auth/callback/azure-ad
      5. Add redirect: http://localhost:3000/api/auth/callback/azure-ad
      6. Under "Certificates & secrets" → create client secret
      7. Under "API permissions" → add: openid, profile, email (delegated)
      8. Copy: Application (client) ID, Directory (tenant) ID, client secret value
      9. Set in .env: AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID
      10. Set NEXT_PUBLIC_AZURE_AD_ENABLED=true
- [ ] Password hashing (bcrypt) for credentials fallback
- [ ] Render deployment (push to GitHub → connect to Render)

### Core Features
- [x] Purchase request form (new request)
- [x] Request list with status filters
- [x] Request detail page
- [x] Admin queue view
- [x] Status workflow (DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → ORDERED → RECEIVED → READY_FOR_PICKUP → PICKED_UP)
- [x] Claude AI queue summarization
- [x] Organization management view
- [x] Budget tracking view
- [ ] **Email sending** — advisor approval emails via Microsoft Graph
      Needs: Mail.Send permission on the Azure AD app (same app as SSO)
      File to implement: lib/graph.ts (scaffold exists, needs real implementation)
- [ ] **Email inbox polling** — check for advisor replies and parse with Claude
      Options: (A) Microsoft Graph webhook, (B) polling cron job every 5 min
- [ ] **Spreadsheet import** — bulk load existing in-flight requests from Excel/CSV
      Partially done in /import page, needs real CSV parsing logic
- [ ] **Email scrape tool** — paste old emails, Claude extracts order status
      Partially done in /import page
- [ ] Student email notifications on status changes (READY_FOR_PICKUP, REJECTED)
- [ ] Request assignment to specific admin
- [ ] Admin notes on requests
- [ ] Attachment upload (vendor quotes, receipts)

### Data Recovery
- [ ] Import existing open purchase orders from spreadsheets
- [ ] Manually enter in-flight requests from email threads
- [ ] Map cost centers to organizations

---

## Phase 2 — Permanent Fix

### Email Automation
- [ ] Microsoft Graph OAuth2 flow to authorize purchasing mailbox
- [ ] Outbound: auto-send advisor approval email when request submitted
- [ ] Inbound: webhook or poll for replies, Claude parses decision
- [ ] Auto-advance status based on parsed decision (PENDING_APPROVAL → APPROVED/REJECTED)
- [ ] Resend reminder email if no response in N days

### Reporting & Finance
- [ ] End-of-year close-out report (PDF/Excel export)
- [ ] Budget utilization report per organization
- [ ] Spending by vendor report
- [ ] Cost center reconciliation export

### Admin Quality of Life
- [ ] Bulk status update
- [ ] Request assignment rules (round-robin, by org, by department)
- [ ] Admin workload dashboard (who has how many active orders)
- [ ] "Mark all as received" for a batch order

### FERPA Compliance
- [ ] Students can only see their own requests (enforce in API)
- [ ] Org leads can see all requests for their org
- [ ] Full audit log for data access (not just mutations)
- [ ] Data export / deletion request flow
- [ ] Session timeout enforcement

---

## Enterprise (Future)

- [ ] Multi-tenant onboarding wizard (self-service school signup)
- [ ] Per-tenant Azure AD configuration
- [ ] Per-tenant branding (logo, school name)
- [ ] Stripe billing for enterprise tiers
- [ ] Department-level isolation within a school
- [ ] API for integration with school ERP systems

---

## Deployment Checklist (Render)

1. [ ] Push code to GitHub repo
2. [ ] Connect repo to Render (render.yaml will auto-configure)
3. [ ] Set environment variables in Render dashboard:
       - NEXTAUTH_URL (your .onrender.com URL)
       - ANTHROPIC_API_KEY (get a fresh one — rotate the one in chat)
       - AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID
       - NEXT_PUBLIC_AZURE_AD_ENABLED=true
       - NEXT_PUBLIC_APP_URL (your .onrender.com URL)
4. [ ] DATABASE_URL auto-set by Render from the stamped-db database
5. [ ] Trigger first deploy
6. [ ] Run seed script on production DB (via Render shell or one-off job)
7. [ ] Verify /api/health returns {"status":"ok"}
8. [ ] Test SSO login
9. [ ] Create first real admin user, set role to SUPER_ADMIN or ADMIN_STAFF

---

## Known Issues / Tech Debt

- Auth: credentials provider currently accepts any password (no bcrypt check) — fine for dev, must fix before prod
- Schema: `sed` command in render.yaml swaps sqlite→postgresql at build time — works but fragile; consider splitting schema files
- Email: lib/graph.ts is scaffolded but Graph API calls are not implemented
- Import: CSV parsing in /api/import is basic; needs field mapping UI for real data
- Thinking param: removed `thinking: {type: "adaptive"}` from Claude calls (was causing SDK errors) — should restore once compatible version is used
