// @vitest-environment node

import { describe, expect, it } from "vitest";
import envConfig from "../../../scripts/lib/env-config";

const { validateEnvironment } = envConfig;

const validOAuthEnv = {
  GITHUB_ID: "client-id",
  GITHUB_SECRET: "client-secret",
  AUTH_SECRET: "auth-secret",
  POSTGRES_URL: "postgresql://localhost/markbase",
  SHARE_ENCRYPTION_KEY: "a".repeat(64),
};

describe("environment validation", () => {
  it("accepts OAuth and bypass development modes", () => {
    expect(validateEnvironment(validOAuthEnv, "development")).toEqual([]);
    expect(
      validateEnvironment(
        {
          AUTH_BYPASS: "true",
          GITHUB_PAT: "token",
          POSTGRES_URL: "postgresql://localhost/markbase",
          SHARE_ENCRYPTION_KEY: "b".repeat(64),
        },
        "development",
      ),
    ).toEqual([]);
  });

  it("reports malformed values without including secrets", () => {
    const errors = validateEnvironment(
      {
        GITHUB_ID: "client-id",
        GITHUB_SECRET: "super-secret-value",
        AUTH_SECRET: "auth-secret",
        POSTGRES_URL: "prisma://bad",
        SHARE_ENCRYPTION_KEY: "short",
      },
      "development",
    );

    expect(errors).toContain("Database URL must be a postgresql:// connection string with a hostname");
    expect(errors).toContain("SHARE_ENCRYPTION_KEY must be 64 hexadecimal characters");
    expect(errors.join(" ")).not.toContain("super-secret-value");
  });

  it("hard-rejects bypass and test mode in production", () => {
    const errors = validateEnvironment(
      {
        ...validOAuthEnv,
        AUTH_BYPASS: "true",
        MARKBASE_TEST_MODE: "true",
        MARKBASE_TEST_SECRET: "test-secret-that-is-at-least-32-characters",
      },
      "production",
    );

    expect(errors).toContain("AUTH_BYPASS must be disabled in production");
    expect(errors).toContain("MARKBASE_TEST_MODE must be disabled in production");
    expect(errors).toContain("MARKBASE_TEST_SECRET must not be configured in production");
  });

  it("validates explicitly configured AI providers", () => {
    expect(
      validateEnvironment(
        { ...validOAuthEnv, AI_PROVIDER: "openai", AI_SUMMARIES_ENABLED: "true" },
        "development",
      ),
    ).toContain("OPENAI_API_KEY is required when AI_PROVIDER=openai");
    expect(
      validateEnvironment(
        { ...validOAuthEnv, AI_PROVIDER: "unknown", AI_SUMMARIES_ENABLED: "true" },
        "development",
      ),
    ).toContain("AI_PROVIDER must be openai, anthropic, or google");
    expect(
      validateEnvironment(
        { ...validOAuthEnv, AI_PROVIDER: "openai", AI_SUMMARIES_ENABLED: "false" },
        "development",
      ),
    ).toEqual([]);
  });

  it("does not require application secrets in deterministic test mode", () => {
    expect(validateEnvironment({}, "test")).toEqual([]);
  });
});
