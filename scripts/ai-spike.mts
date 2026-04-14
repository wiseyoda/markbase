/**
 * One-shot spike to verify each configured AI provider actually works.
 * Run with: node --env-file=.env.local --import tsx scripts/ai-spike.mts
 * Or:       pnpm tsx --env-file=.env.local scripts/ai-spike.mts
 *
 * Prints which providers have keys, tries a cheap summary with each that does,
 * and reports latency + token usage. Never logs key values.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, type LanguageModel } from "ai";

const SAMPLE_DOC = `# Markbase
Markbase is a hosted markdown viewer for GitHub repositories. It renders docs
with GitHub-flavored markdown, adds inline comments, share links, and lets
teams collaborate on design docs without leaving a browser. Built with
Next.js, Postgres, and Auth.js. Deployed on Vercel at markbase.io.`;

const SYSTEM = "You summarize technical documentation in two to three crisp sentences for a reader scanning a doc index. No preamble. No markdown.";
const PROMPT = `Summarize this document:\n\n${SAMPLE_DOC}`;

interface Attempt {
  label: string;
  envKey: string;
  model: string;
  build: () => LanguageModel;
}

const ATTEMPTS: Attempt[] = [
  {
    label: "openai",
    envKey: "OPENAI_API_KEY",
    model: process.env.AI_MODEL_OPENAI ?? "gpt-5.4-mini",
    build: () => createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })(
      process.env.AI_MODEL_OPENAI ?? "gpt-5.4-mini",
    ),
  },
  {
    label: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    model: process.env.AI_MODEL_ANTHROPIC ?? "claude-haiku-4-5",
    build: () => createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })(
      process.env.AI_MODEL_ANTHROPIC ?? "claude-haiku-4-5",
    ),
  },
  {
    label: "google",
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    model: process.env.AI_MODEL_GOOGLE ?? "gemini-3.1-flash-lite-preview",
    build: () => createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! })(
      process.env.AI_MODEL_GOOGLE ?? "gemini-3.1-flash-lite-preview",
    ),
  },
];

async function main() {
  console.log("=== AI spike ===");
  console.log(`Node: ${process.version}`);
  console.log();

  for (const attempt of ATTEMPTS) {
    const present = Boolean(process.env[attempt.envKey]?.trim());
    console.log(`[${attempt.label}] ${attempt.envKey}: ${present ? "✓ set" : "— missing, skipping"}`);
    if (!present) continue;

    const started = Date.now();
    try {
      // gpt-5.x reasoning models reject temperature; others accept it.
      const isReasoningModel = attempt.label === "openai" && /^gpt-5/.test(attempt.model);
      const result = await generateText({
        model: attempt.build(),
        system: SYSTEM,
        prompt: PROMPT,
        maxOutputTokens: 200,
        ...(isReasoningModel ? {} : { temperature: 0.3 }),
        abortSignal: AbortSignal.timeout(30_000),
      });
      const ms = Date.now() - started;
      console.log(`  model: ${attempt.model}`);
      console.log(`  tokens: in=${result.usage.inputTokens ?? "?"} out=${result.usage.outputTokens ?? "?"}`);
      console.log(`  duration: ${ms}ms`);
      console.log(`  text: ${result.text.trim()}`);
    } catch (err) {
      const ms = Date.now() - started;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ failed in ${ms}ms: ${msg}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
