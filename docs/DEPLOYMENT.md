# Production Deployment & Operations Guide
## Smart Student Manager

This guide details the complete procedure for deploying **Smart Student Manager** to production on **Vercel** with a managed **PostgreSQL** database (e.g., Neon, Supabase, or AWS RDS).

---

## 1. Architecture: Local vs. Production

| Environment | Database | Connection Model | Schema File |
| :--- | :--- | :--- | :--- |
| **Local Development** | SQLite (`file:./dev.db`) | Direct local file access | `prisma/schema.prisma` |
| **Production** | PostgreSQL (v14+) | Pooled + Direct connection | `prisma/schema.postgresql.prisma` |

---

## 2. Production Database Setup (Neon / Supabase / AWS RDS)

### Step 2.1: Provisioning
1. Create a PostgreSQL project on a cloud database provider:
   - **Recommended:** [Neon Serverless Postgres](https://neon.tech) (Native connection pooling & autoscaling)
   - **Alternative:** [Supabase Postgres](https://supabase.com)
2. Retrieve two connection strings:
   - **Pooled URL (`DATABASE_URL`):** Optimized for serverless Next.js functions using PgBouncer/connection pooler (port `6543` or pooler domain).
   - **Direct URL (`DIRECT_URL`):** Required for executing Prisma migrations and DDL operations (port `5432` or direct compute endpoint).

### Step 2.2: Example Connection Strings
```env
# Neon / Supabase Pooled Connection (used by application queries)
DATABASE_URL="postgresql://student_admin:secretpassword@ep-cool-forest-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true"

# Neon / Supabase Direct Connection (used for migrations)
DIRECT_URL="postgresql://student_admin:secretpassword@ep-cool-forest-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

---

## 3. Required Environment Variables

Configure the following variables in the **Vercel Project Dashboard** under **Settings → Environment Variables**:

| Variable | Scope | Example / Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Production, Preview | Pooled PostgreSQL connection string |
| `DIRECT_URL` | Production, Preview | Direct PostgreSQL connection string for DDL |
| `AUTH_SECRET` | Production, Preview | 32+ character high-entropy key for JWT signing |
| `NEXT_PUBLIC_APP_URL` | Production | `https://your-domain.vercel.app` |
| `NODE_ENV` | Production | `production` |

### Generating a Secure `AUTH_SECRET`
Generate a high-entropy secret using OpenSSL or Node:
```bash
# Linux / macOS:
openssl rand -base64 32

# Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

> [!CAUTION]
> Never commit `.env` or production secrets to Git. Verify that `.gitignore` contains `.env*`.

---

## 4. Prisma Production Schema & Migrations

The repository contains `prisma/schema.postgresql.prisma` configured for PostgreSQL.

### Step 4.1: Deploying Schema to Production
Before the first deployment, apply the PostgreSQL schema to your database:

```bash
# Push schema directly to your production database:
npx prisma db push --schema=prisma/schema.postgresql.prisma
```

Alternatively, to maintain strict migration history:
```bash
# Generate and deploy a migration:
npx prisma migrate dev --name init_production --schema=prisma/schema.postgresql.prisma
npx prisma migrate deploy --schema=prisma/schema.postgresql.prisma
```

---

## 5. Vercel Project Configuration

### Step 5.1: Build & Install Settings
Smart Student Manager uses Next.js 16 with Turbopack. In `package.json`:
- **Build Command:** `next build`
- **Install Command:** `npm install` (or default Vercel install)
- **Postinstall Hook:** `"postinstall": "prisma generate"` automatically ensures the Prisma Client binary is compiled for Vercel's Amazon Linux runtime.

### Step 5.2: Linking to Vercel
1. Push your code to GitHub / GitLab / Bitbucket.
2. In Vercel, click **"Add New Project"** and import the repository.
3. Keep Framework Preset as **Next.js**.
4. In **Environment Variables**, paste the production values documented above.
5. Click **"Deploy"**.

---

## 6. Post-Deployment Verification Checklist

Execute these checks immediately following your first deployment:

### 1. Health & Landing Page
- [ ] Visit `https://your-domain.vercel.app`
- [ ] Verify homepage loads with 200 OK and styles render properly.

### 2. Student Authentication & Isolation
- [ ] Register a new student account at `/register`.
- [ ] Verify account creation succeeds and redirects to `/dashboard`.
- [ ] Log out via top navbar profile dropdown.
- [ ] Log back in at `/login` with valid credentials.
- [ ] Verify invalid password generates a clean error notification.

### 3. Dashboard Command Center
- [ ] Verify `/dashboard` displays live student stats (Semester 1 default, CGPA, SGPA, attendance buffer, zero-deadline empty state).
- [ ] Verify the Liquid Glass + Cyberpunk theme applies consistently.

### 4. Academic & Attendance Data Entry
- [ ] Navigate to `/grades`, create a subject, and enter a test grade.
- [ ] Verify SGPA calculates immediately.
- [ ] Navigate to `/attendance`, mark a subject "+ Present" and "+ Absent".
- [ ] Return to `/dashboard` and verify Cumulative CGPA and Attendance Radar updated synchronously without stale cache.

### 5. Events & Reminders
- [ ] Navigate to `/events` and schedule an exam with 2 reminders.
- [ ] Verify event appears on both the List View and monthly Calendar View.
- [ ] Navigate to `/reminders` and verify scheduled triggers appear in the action center.
- [ ] Return to `/dashboard` and confirm the event appears in the "Upcoming Deadlines" widget.

### 6. Persistence Verification
- [ ] Trigger a redeployment or wait for a serverless cold start.
- [ ] Refresh the application and confirm all created semesters, grades, attendance logs, and events persist completely without data loss.

---

## 7. Troubleshooting Common Production Issues

### Problem: Prisma Client Cannot Find Schema
**Symptom:** `Error: @prisma/client did not initialize yet. Please run "prisma generate"...`
**Solution:** Verify that `"postinstall": "prisma generate"` exists in `package.json`. If using `schema.postgresql.prisma` in production, update postinstall to:
`"postinstall": "prisma generate --schema=prisma/schema.postgresql.prisma"`

### Problem: Database Connection Exhaustion (P1001 / P2024)
**Symptom:** `Timed out fetching a new connection from the connection pool.`
**Solution:** Ensure `DATABASE_URL` connects via the pooled connection string (with `?pgbouncer=true` or Neon pooler domain), rather than the direct connection port.

### Problem: Session Cookie Missing on HTTPS
**Symptom:** User logs in but gets redirected back to `/login`.
**Solution:** In `src/lib/auth/session.ts`, the session cookie uses `SameSite: "lax"` and `secure: process.env.NODE_ENV === "production"`. Ensure the production domain uses HTTPS (default on Vercel).
