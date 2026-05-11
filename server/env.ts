import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type AuthMode = "clerk" | "mock";
export type DatabaseProvider = "sqlite" | "postgres";

loadDotEnv();

const isProduction = process.env.NODE_ENV === "production";

export function getAuthMode(): AuthMode {
  if (isProduction) return "clerk";
  if (process.env.AUTH_MODE === "mock") return "mock";
  if (!process.env.CLERK_SECRET_KEY) return "mock";
  return "clerk";
}

export function getAllowedFrontendOrigin() {
  return process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";
}

export function getDatabasePath() {
  return process.env.EDGETRACE_DB_PATH || "";
}

export function getDatabaseProvider(): DatabaseProvider {
  return process.env.DATABASE_PROVIDER === "postgres" ? "postgres" : "sqlite";
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || "";
}

export function validateServerEnvironment() {
  const authMode = getAuthMode();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isProduction) {
    if (
      process.env.DATABASE_PROVIDER &&
      process.env.DATABASE_PROVIDER !== "sqlite" &&
      process.env.DATABASE_PROVIDER !== "postgres"
    ) {
      errors.push("DATABASE_PROVIDER must be sqlite or postgres.");
    }

    if (process.env.AUTH_MODE !== "clerk") errors.push("AUTH_MODE must be set to clerk in production.");
    for (const key of [
      "CLERK_SECRET_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRO_PRICE_ID",
      "STRIPE_ADVANCED_PRICE_ID"
    ]) {
      if (!process.env[key]) errors.push(`${key} is required in production.`);
    }

    if (!process.env.FRONTEND_URL && !process.env.APP_URL) {
      errors.push("FRONTEND_URL or APP_URL is required in production.");
    }

    if (getDatabaseProvider() === "postgres" && !process.env.DATABASE_URL) {
      errors.push("DATABASE_URL is required when DATABASE_PROVIDER=postgres.");
    }

    if (getDatabaseProvider() !== "postgres") {
      errors.push("DATABASE_PROVIDER must be postgres for production deployment.");
    }
  }

  if (authMode === "clerk" && !process.env.CLERK_SECRET_KEY) {
    errors.push("CLERK_SECRET_KEY is required when AUTH_MODE is clerk.");
  }

  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push("STRIPE_SECRET_KEY is set, but STRIPE_WEBHOOK_SECRET is missing. Checkout may work, but plans will not update from webhooks.");
  }

  if (errors.length > 0) {
    throw new Error(`EdgeTrace environment validation failed:\n- ${errors.join("\n- ")}`);
  }

  for (const warning of warnings) {
    console.warn(`[env] ${warning}`);
  }

  return { authMode, warnings };
}

export function validateClientEnvironment() {
  if (!isProduction) return;

  const errors: string[] = [];
  if (process.env.VITE_AUTH_MODE !== "clerk") errors.push("VITE_AUTH_MODE must be set to clerk in production.");
  if (!process.env.VITE_CLERK_PUBLISHABLE_KEY) {
    errors.push("VITE_CLERK_PUBLISHABLE_KEY is required in production.");
  }

  if (errors.length > 0) {
    throw new Error(`EdgeTrace client environment validation failed:\n- ${errors.join("\n- ")}`);
  }
}

function loadDotEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), filename);
    if (!existsSync(envPath)) continue;
    loadDotEnvFile(envPath);
  }
}

function loadDotEnvFile(envPath: string) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
