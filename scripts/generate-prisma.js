#!/usr/bin/env node

/**
 * Cross-Platform Prisma Client Generator Script
 * 
 * Selects the appropriate Prisma schema based on deployment environment:
 * - Local Development / Default: prisma/schema.prisma (SQLite)
 * - Vercel Production / CI / PostgreSQL: prisma/schema.postgresql.prisma (PostgreSQL)
 */

/* eslint-disable @typescript-eslint/no-require-imports */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const projectRoot = path.resolve(__dirname, "..");

// Check CLI flags
const forcePostgresArg = process.argv.includes("--postgres");
const forceSqliteArg = process.argv.includes("--sqlite");

// Check Vercel environment variables
const isVercel =
  process.env.VERCEL === "1" ||
  process.env.VERCEL === "true" ||
  Boolean(process.env.VERCEL_ENV);

// Check environment variables for explicit database configuration
const isExplicitPostgres =
  process.env.PRISMA_SCHEMA === "postgresql" ||
  process.env.PRISMA_TARGET === "postgres" ||
  process.env.DATABASE_PROVIDER === "postgresql";

const isPostgresUrl =
  typeof process.env.DATABASE_URL === "string" &&
  (process.env.DATABASE_URL.startsWith("postgresql://") ||
    process.env.DATABASE_URL.startsWith("postgres://"));

// Decision logic:
// 1. Explicit CLI flag takes precedence
// 2. Otherwise if on Vercel, explicit postgres env, or postgres URL -> use PostgreSQL
// 3. Default to SQLite for local development
let usePostgres = false;
let reason = "local default";

if (forceSqliteArg) {
  usePostgres = false;
  reason = "CLI flag --sqlite";
} else if (forcePostgresArg) {
  usePostgres = true;
  reason = "CLI flag --postgres";
} else if (isVercel) {
  usePostgres = true;
  reason = `Vercel environment (VERCEL=${process.env.VERCEL || ""}, VERCEL_ENV=${process.env.VERCEL_ENV || ""})`;
} else if (isExplicitPostgres) {
  usePostgres = true;
  reason = `explicit env var (PRISMA_SCHEMA=${process.env.PRISMA_SCHEMA || ""})`;
} else if (isPostgresUrl) {
  usePostgres = true;
  reason = "DATABASE_URL postgresql protocol prefix";
}

const schemaRelativePath = usePostgres
  ? path.join("prisma", "schema.postgresql.prisma")
  : path.join("prisma", "schema.prisma");

const schemaAbsolutePath = path.join(projectRoot, schemaRelativePath);

console.log(`[prisma-generate] ----------------------------------------------------`);
console.log(`[prisma-generate] Environment : ${isVercel ? "Vercel Platform" : "Local Development"}`);
console.log(`[prisma-generate] Target DB   : ${usePostgres ? "PostgreSQL (Production)" : "SQLite (Local)"}`);
console.log(`[prisma-generate] Selected    : ${schemaRelativePath}`);
console.log(`[prisma-generate] Reason      : ${reason}`);
console.log(`[prisma-generate] ----------------------------------------------------`);

if (!fs.existsSync(schemaAbsolutePath)) {
  console.error(`[prisma-generate] FATAL: Schema file does not exist at: ${schemaAbsolutePath}`);
  process.exit(1);
}

try {
  execSync(`npx prisma generate --schema="${schemaAbsolutePath}"`, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  console.log(`[prisma-generate] Successfully generated Prisma Client from ${schemaRelativePath}.`);
} catch (error) {
  console.error(`[prisma-generate] Generation failed with error:`, error);
  process.exit(1);
}
