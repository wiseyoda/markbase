// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setAiTestModel,
  generateAiText,
  getAiStatus,
  type AiProvider,
} from "@/lib/ai";
import { MockLanguageModelV3 } from "ai/test";

const ENV_VARS = [
  "AI_SUMMARIES_ENABLED",
  "AI_PROVIDER",
  "AI_MODEL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

function resetEnv() {
  for (const k of ENV_VARS) delete process.env[k];
}

function buildUsage(inputTotal: number | undefined, outputTotal: number | undefined) {
  return {
    inputTokens: {
      total: inputTotal,
      noCache: inputTotal,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTotal,
      text: outputTotal,
      reasoning: undefined,
    },
  };
}

function buildGenerateResult(text: string, inputTokens = 42, outputTokens = 18) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: buildUsage(inputTokens, outputTokens),
    warnings: [],
  };
}

function buildMockModel(text: string, inputTokens = 42, outputTokens = 18) {
  return new MockLanguageModelV3({
    doGenerate: async () => buildGenerateResult(text, inputTokens, outputTokens),
  });
}

function buildCapturingModel(text: string, captured: Array<{ temperature?: number }>) {
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      captured.push({ temperature: options.temperature });
      return buildGenerateResult(text, 1, 1);
    },
  });
}

describe("getAiStatus", () => {
  beforeEach(() => {
    resetEnv();
  });
  afterEach(() => {
    __setAiTestModel(null);
    resetEnv();
  });

  it("is disabled when AI_SUMMARIES_ENABLED=false", () => {
    process.env.AI_SUMMARIES_ENABLED = "false";
    process.env.OPENAI_API_KEY = "test-key";
    const status = getAiStatus();
    expect(status.enabled).toBe(false);
    expect(status.reason).toContain("AI_SUMMARIES_ENABLED");
  });

  it("is disabled when AI_SUMMARIES_ENABLED=0 (alternate false)", () => {
    process.env.AI_SUMMARIES_ENABLED = "0";
    process.env.OPENAI_API_KEY = "test-key";
    expect(getAiStatus().enabled).toBe(false);
  });

  it("is disabled when no provider key is present", () => {
    const status = getAiStatus();
    expect(status.enabled).toBe(false);
    expect(status.reason).toContain("no provider");
  });

  it("auto-picks openai when its key is present", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const status = getAiStatus();
    expect(status.enabled).toBe(true);
    expect(status.provider).toBe("openai");
    expect(status.model).toBe("gpt-5.4-mini");
  });

  it("auto-picks anthropic when only its key is present", () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const status = getAiStatus();
    expect(status.provider).toBe("anthropic");
    expect(status.model).toBe("claude-haiku-4-5");
  });

  it("auto-picks google when only its key is present", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key";
    const status = getAiStatus();
    expect(status.provider).toBe("google");
    expect(status.model).toBe("gemini-3.1-flash-lite-preview");
  });

  it("respects AI_PROVIDER selection when the matching key is present", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    process.env.AI_PROVIDER = "anthropic";
    const status = getAiStatus();
    expect(status.provider).toBe("anthropic");
  });

  it("is disabled when AI_PROVIDER is explicit but its key is missing", () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    process.env.AI_PROVIDER = "openai";
    const status = getAiStatus();
    expect(status.enabled).toBe(false);
  });

  it("falls back to provider preference when AI_PROVIDER is unknown", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.AI_PROVIDER = "some-other-provider";
    const status = getAiStatus();
    expect(status.provider).toBe("openai");
  });

  it("allows explicit model override via AI_MODEL", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.AI_MODEL = "gpt-4o-mini";
    const status = getAiStatus();
    expect(status.model).toBe("gpt-4o-mini");
  });

  it("treats blank env values as unset", () => {
    process.env.OPENAI_API_KEY = "   ";
    const status = getAiStatus();
    expect(status.enabled).toBe(false);
  });
});

describe("generateAiText", () => {
  beforeEach(() => {
    resetEnv();
  });
  afterEach(() => {
    __setAiTestModel(null);
    resetEnv();
  });

  it("returns null when AI is disabled", async () => {
    const result = await generateAiText({ system: "s", prompt: "p" });
    expect(result).toBeNull();
  });

  it("uses the test override model and returns structured output", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    __setAiTestModel({
      provider: "openai" as AiProvider,
      model: "mock-model",
      instance: buildMockModel("Summary text."),
    });
    const result = await generateAiText({ system: "system", prompt: "prompt" });
    expect(result).not.toBeNull();
    expect(result?.text).toBe("Summary text.");
    expect(result?.provider).toBe("openai");
    expect(result?.model).toBe("mock-model");
    expect(result?.inputTokens).toBe(42);
    expect(result?.outputTokens).toBe(18);
    expect(result?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("trims whitespace from model output", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    __setAiTestModel({
      provider: "openai" as AiProvider,
      model: "mock-model",
      instance: buildMockModel("  padded summary  \n"),
    });
    const result = await generateAiText({ system: "s", prompt: "p" });
    expect(result?.text).toBe("padded summary");
  });

  it("returns null and logs a warning when generation throws", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    __setAiTestModel({
      provider: "openai" as AiProvider,
      model: "mock-model",
      instance: new MockLanguageModelV3({
        doGenerate: async () => {
          throw new Error("provider boom");
        },
      }),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await generateAiText({ system: "s", prompt: "p" });
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips temperature for gpt-5.x reasoning models", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.AI_MODEL = "gpt-5.4-mini";
    const captured: Array<{ temperature?: number }> = [];
    __setAiTestModel({
      provider: "openai" as AiProvider,
      model: "gpt-5.4-mini",
      instance: buildCapturingModel("ok", captured),
    });
    await generateAiText({ system: "s", prompt: "p", temperature: 0.7 });
    expect(captured[0].temperature).toBeUndefined();
  });

  it("passes temperature through for non-reasoning openai models", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.AI_MODEL = "gpt-4o-mini";
    const captured: Array<{ temperature?: number }> = [];
    __setAiTestModel({
      provider: "openai" as AiProvider,
      model: "gpt-4o-mini",
      instance: buildCapturingModel("ok", captured),
    });
    await generateAiText({ system: "s", prompt: "p", temperature: 0.7 });
    expect(captured[0].temperature).toBe(0.7);
  });

  it("passes temperature through for anthropic models", async () => {
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    const captured: Array<{ temperature?: number }> = [];
    __setAiTestModel({
      provider: "anthropic" as AiProvider,
      model: "claude-haiku-4-5",
      instance: buildCapturingModel("ok", captured),
    });
    await generateAiText({ system: "s", prompt: "p" });
    expect(captured[0].temperature).toBe(0.3);
  });

  it("builds a real openai model when no test override is set", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    __setAiTestModel(null);
    // Without an override, generateAiText will attempt a real provider call.
    // Stub global fetch so the SDK's underlying request throws synchronously,
    // hitting the catch branch — but only after buildModel's openai path runs.
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network disabled in test");
    }) as typeof fetch;
    try {
      const result = await generateAiText({ system: "s", prompt: "p" });
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("builds a real anthropic model when no test override is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    __setAiTestModel(null);
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network disabled");
    }) as typeof fetch;
    try {
      const result = await generateAiText({ system: "s", prompt: "p" });
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("builds a real google model when no test override is set", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "gkey";
    __setAiTestModel(null);
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network disabled");
    }) as typeof fetch;
    try {
      const result = await generateAiText({ system: "s", prompt: "p" });
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("coerces missing token counts to zero", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    __setAiTestModel({
      provider: "openai" as AiProvider,
      model: "mock",
      instance: new MockLanguageModelV3({
        doGenerate: async () => buildGenerateResult("hi", 0, 0),
      }),
    });
    // Force undefined token counts via a second mock
    __setAiTestModel({
      provider: "openai" as AiProvider,
      model: "mock",
      instance: new MockLanguageModelV3({
        doGenerate: async () => ({
          ...buildGenerateResult("hi"),
          usage: buildUsage(undefined, undefined),
        }),
      }),
    });
    const result = await generateAiText({ system: "s", prompt: "p" });
    expect(result?.inputTokens).toBe(0);
    expect(result?.outputTokens).toBe(0);
  });
});
