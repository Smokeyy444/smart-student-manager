# Database Provider & Migration Guide

## Overview

Smart Student Manager is configured to use **SQLite** for rapid, zero-dependency local development, and is designed to migrate cleanly to **PostgreSQL** in production (such as Supabase, Neon, AWS RDS, or Railway).

---

## Key Differences Between SQLite and PostgreSQL

| Feature / Consideration | SQLite (Local Dev) | PostgreSQL (Production) |
|---|---|---|
| **Datasource Provider** | `provider = "sqlite"` | `provider = "postgresql"` |
| **Connection URL** | `file:./dev.db` | `postgresql://user:pass@host:5432/dbname?schema=public` |
| **Enums** | Emulated via Prisma runtime strings & check constraints | Native PostgreSQL `CREATE TYPE ... AS ENUM` |
| **Concurrency & Locking** | Single-file locking (best for single-user local) | Multi-version concurrency control (MVCC) |
| **JSON Fields** | Stored as text / stringified JSON | Native `jsonb` indexing |
| **DateTime Handling** | ISO-8601 strings / milliseconds | Timestamp with timezone (`TIMESTAMPTZ`) |

---

## Migration History Isolation

> **CRITICAL RULE:** Do NOT reuse SQLite migration folders for PostgreSQL.
> SQLite migrations and PostgreSQL migrations generate fundamentally different SQL DDL statements (e.g., PostgreSQL creates enum types and specific sequence tables, which fail on SQLite, and vice-versa).

### How to Switch to PostgreSQL in Production:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set your production `DATABASE_URL` in `.env.production`:
   ```env
   DATABASE_URL="postgresql://student_admin:secure_password@prod-db.example.com:5432/smart_student_db?schema=public"
   ```
3. Generate production migrations:
   ```bash
   npx prisma migrate dev --name init_postgresql
   ```
4. In CI/CD or production deployments, apply migrations using:
   ```bash
   npx prisma migrate deploy
   ```
