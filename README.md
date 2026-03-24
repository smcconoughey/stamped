# Stamped

A FERPA-compliant purchase request portal for educational institutions. Students submit purchase requests, advisors approve them via email, and admin staff track orders through to pickup.

---

## URLs

| Route | Description |
|-------|-------------|
| `/login` | Sign in with email/password or Microsoft SSO |
| `/` | Role-based dashboard (pipeline summary for admins, personal summary for students) |
| `/requests` | All purchase requests — filter, sort, bulk update |
| `/requests/new` | Submit a new purchase request |
| `/requests/[id]` | Request detail — inline editing, status timeline, approval history |
| `/admin/queue` | Admin batch queue with AI summary, "needs action" highlights, and draft email modal |
| `/organizations` | Organization list and membership management |
| `/organizations/[id]` | Org detail and member roster |
| `/finance/budgets` | Budget tracking — allocated, spent, reserved by fiscal year |
| `/import` | Bulk import via CSV/Excel or email scraping |
| `/platform/tenants` | Platform admin — manage schools/institutions (super-admin only) |

**API health check:** `GET /api/health`

---

## Quick Walkthrough

### 1. Local Setup

```bash
cp .env.example .env.local
# Fill in at minimum: DATABASE_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY

npm install
npm run db:push       # Initialize the database schema
npm run db:seed       # (Optional) Load sample data
npm run dev           # http://localhost:3000
```

Generate a secret: `openssl rand -base64 32`

### 2. First Login

- **Platform admin** — use the `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` from `.env.local`. This account accesses `/platform/tenants` to create and manage institutions.
- **Tenant users** — created via the admin UI or by self-registering with a recognized email domain.

### 3. Submitting a Request (Student)

1. Log in and go to **Requests → New Request**
2. Fill in the title, required-by date, and line items (name, qty, unit price, vendor URL)
3. Submit — status moves to `SUBMITTED`
4. An approval email is sent to the advisor; their reply is parsed automatically

### 4. Processing Requests (Admin Staff)

1. Open **Admin Queue** (`/admin/queue`) to see everything that needs attention
2. The AI summary at the top surfaces urgent items and blockers
3. Click a request to open the detail modal — update status, assign a budget, add notes
4. Status can also be updated inline by clicking nodes on the timeline
5. Use checkboxes for bulk status changes or budget assignments

### 5. Request Status Flow

```
DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → ORDERED → RECEIVED → READY_FOR_PICKUP → PICKED_UP
                                      ↘ REJECTED / CANCELLED / ON_HOLD
```

### 6. Email Configuration

Two options — set one in `.env.local`:

**Option A — SMTP (simplest):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # Gmail App Password
```

**Option B — Microsoft Graph:**
```
AZURE_AD_TENANT_ID=<your-tenant-uuid>
AZURE_AD_CLIENT_ID=<app-registration-client-id>
AZURE_AD_CLIENT_SECRET=<secret>
MS_EMAIL_ADDRESS=purchasing@yourschool.edu
```

To enable the Microsoft SSO button on the login page, set `NEXT_PUBLIC_AZURE_AD_ENABLED=true` and configure the Azure app registration with redirect URI `http://localhost:3000/api/auth/callback/azure-ad`.

### 7. Roles

| Role | Access |
|------|--------|
| `STUDENT` | Own requests only |
| `ORG_LEAD` | Requests within their organizations |
| `ADMIN_STAFF` | All requests, queue, bulk actions |
| `FINANCE_ADMIN` | All requests + budget management |
| `SUPER_ADMIN` | Everything within a tenant |
| `PLATFORM_ADMIN` | Cross-tenant management at `/platform` |

---

## Demo Mode

A read-only demo mode lets you walk through every UI flow (login, onboarding, request creation, org setup) against the live database **without writing any data**.

| Action | URL |
|--------|-----|
| **Enable** | `/api/demo` or `/api/demo?on=true` |
| **Disable** | `/api/demo?on=false` or click "Exit Demo" on the banner |

When active:
- An amber banner appears on every page: *"Demo Mode — All actions are simulated. No data is being saved."*
- All POST/PATCH/PUT/DELETE requests to `/api/*` are intercepted by middleware and return mock success responses — no database writes occur
- GET requests pass through normally so you see real data
- Auth routes (`/api/auth/*`) are excluded so login/logout still work
- The onboarded-check redirect is bypassed so you can access the dashboard with un-onboarded test accounts

The demo cookie expires after 24 hours.

---

## Security

### Rate Limiting

Login attempts (`POST /api/auth/callback/credentials`) are rate-limited to **10 attempts per IP per 15-minute window**. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header. The limiter uses an in-memory sliding window — suitable for single-instance deployments on Render. For multi-instance, swap in Upstash or Redis.

### Security Headers

All responses include the following headers (configured in `next.config.mjs`):

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; ...` |

The `X-Powered-By` header is suppressed (`poweredByHeader: false`).

### Other Hardening

- **Health endpoint** (`/api/health`) returns only `{ "status": "ok" }` — no component-level detail.
- **robots.txt** disallows crawling of `/api/`, `/platform/`, `/admin/`, `/onboard`, and `/setup`.

---

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** ORM — SQLite in dev, PostgreSQL in production
- **NextAuth v4** — credentials + Azure AD OAuth
- **Tailwind CSS** + **shadcn/ui** components
- **Claude (Anthropic)** — queue summarization and email parsing
- **Nodemailer / Microsoft Graph** — email sending
- **Render** — production hosting (`render.yaml` included)

## Deployment (Render)

1. Push to GitHub and connect the repo in Render — it auto-reads `render.yaml`
2. Set environment variables in the Render dashboard
3. Render provisions a PostgreSQL database automatically
4. Health check runs at `/api/health`
