import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export type AiProvider = "openai" | "anthropic" | "google";

export interface AiStatus {
  enabled: boolean;
  provider: AiProvider | null;
  model: string | null;
  reason?: string;
}

export interface AiGenerateInput {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiGenerateResult {
  text: string;
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-4-5",
  google: "gemini-3.1-flash-lite-preview",
};

/**
 * OpenAI gpt-5.x models are reasoning models that reject the `temperature`
 * parameter. Callers should skip temperature for these.
 */
function supportsTemperature(provider: AiProvider, model: string): boolean {
  if (provider === "openai" && /^gpt-5/.test(model)) return false;
  return true;
}

const API_KEY_ENV: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

const PROVIDER_PREFERENCE: AiProvider[] = ["openai", "anthropic", "google"];

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function killSwitchOff(): boolean {
  const v = readEnv("AI_SUMMARIES_ENABLED");
  if (!v) return false;
  return v.toLowerCase() === "false" || v === "0";
}

function providerHasKey(provider: AiProvider): boolean {
  return Boolean(readEnv(API_KEY_ENV[provider]));
}

function resolveProvider(): AiProvider | null {
  const explicit = readEnv("AI_PROVIDER")?.toLowerCase() as AiProvider | undefined;
  if (explicit && PROVIDER_PREFERENCE.includes(explicit)) {
    return providerHasKey(explicit) ? explicit : null;
  }
  return PROVIDER_PREFERENCE.find(providerHasKey) ?? null;
}

/** Compute whether AI summary features are available and which provider will be used. */
export function getAiStatus(): AiStatus {
  if (killSwitchOff()) {
    return { enabled: false, provider: null, model: null, reason: "AI_SUMMARIES_ENABLED=false" };
  }
  const provider = resolveProvider();
  if (!provider) {
    return {
      enabled: false,
      provider: null,
      model: null,
      reason: "no provider API key present",
    };
  }
  const model = readEnv("AI_MODEL") ?? DEFAULT_MODELS[provider];
  return { enabled: true, provider, model };
}

/** Internal: allow tests to inject a LanguageModel bypassing env resolution. */
let testModelOverride: { provider: AiProvider; model: string; instance: LanguageModel } | null =
  null;

/** Test-only: inject a mock language model. Pass null to clear. */
export function __setAiTestModel(
  override: { provider: AiProvider; model: string; instance: LanguageModel } | null,
): void {
  testModelOverride = override;
}

function buildModel(provider: AiProvider, model: string): LanguageModel {
  if (testModelOverride) return testModelOverride.instance;
  const apiKey = readEnv(API_KEY_ENV[provider]);
  if (!apiKey) throw new Error(`Missing ${API_KEY_ENV[provider]}`);

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
  }
}

/**
 * Generate text via the configured provider. Returns null if AI is disabled or
 * the underlying call fails — the caller decides how to degrade.
 */
export async function generateAiText(
  input: AiGenerateInput,
): Promise<AiGenerateResult | null> {
  const status = getAiStatus();
  if (!status.enabled || !status.provider || !status.model) return null;

  const provider = testModelOverride?.provider ?? status.provider;
  const model = testModelOverride?.model ?? status.model;

  const started = Date.now();
  try {
    const allowTemperature = supportsTemperature(provider, model);
    const result = await generateText({
      model: buildModel(status.provider, status.model),
      system: input.system,
      prompt: input.prompt,
      maxOutputTokens: input.maxOutputTokens ?? 300,
      ...(allowTemperature ? { temperature: input.temperature ?? 0.3 } : {}),
      abortSignal: AbortSignal.timeout(20_000),
    });

    return {
      text: result.text.trim(),
      provider,
      model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[ai] ${provider}/${model} generation failed: ${reason}`);
    return null;
  }
}
