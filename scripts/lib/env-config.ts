export type EnvironmentMode = "development" | "production" | "test";

const AI_PROVIDERS = ["openai", "anthropic", "google"] as const;

type EnvMap = Readonly<Record<string, string | undefined>>;

function present(env: EnvMap, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function isDisabled(value: string | undefined): boolean {
  return value === "0" || value?.toLowerCase() === "false";
}

export function validateEnvironment(
  env: EnvMap,
  mode: EnvironmentMode,
): string[] {
  if (mode === "test") return [];

  const errors: string[] = [];
  const bypass = env.AUTH_BYPASS === "true";

  if (mode === "production" && bypass) {
    errors.push("AUTH_BYPASS must be disabled in production");
  }
  if (mode === "production" && env.MARKBASE_TEST_MODE === "true") {
    errors.push("MARKBASE_TEST_MODE must be disabled in production");
  }
  if (mode === "production" && present(env, "MARKBASE_TEST_SECRET")) {
    errors.push("MARKBASE_TEST_SECRET must not be configured in production");
  }

  if (bypass && mode === "development") {
    if (!present(env, "GITHUB_PAT")) {
      errors.push("GITHUB_PAT is required when AUTH_BYPASS=true");
    }
  } else {
    for (const name of ["GITHUB_ID", "GITHUB_SECRET", "AUTH_SECRET"]) {
      if (!present(env, name)) errors.push(`${name} is required for GitHub OAuth`);
    }
  }

  const databaseUrl = env.PRISMA_DATABASE_URL?.trim() || env.POSTGRES_URL?.trim();
  if (!databaseUrl) {
    errors.push("PRISMA_DATABASE_URL or POSTGRES_URL is required");
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (!parsed.hostname || !["postgres:", "postgresql:"].includes(parsed.protocol)) {
        errors.push("Database URL must be a postgresql:// connection string with a hostname");
      }
    } catch {
      errors.push("Database URL is malformed");
    }
  }

  if (!/^[a-f0-9]{64}$/i.test(env.SHARE_ENCRYPTION_KEY?.trim() || "")) {
    errors.push("SHARE_ENCRYPTION_KEY must be 64 hexadecimal characters");
  }

  const configuredProvider = env.AI_PROVIDER?.trim().toLowerCase();
  if (configuredProvider && !AI_PROVIDERS.includes(configuredProvider as (typeof AI_PROVIDERS)[number])) {
    errors.push("AI_PROVIDER must be openai, anthropic, or google");
  }
  if (!isDisabled(env.AI_SUMMARIES_ENABLED) && configuredProvider) {
    const keyName = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
    }[configuredProvider];
    if (keyName && !present(env, keyName)) {
      errors.push(`${keyName} is required when AI_PROVIDER=${configuredProvider}`);
    }
  }

  return errors;
}

const envConfig = { validateEnvironment };

export default envConfig;
