import nextEnv from "@next/env";
import envConfig from "./lib/env-config";

type EnvironmentMode = "development" | "production" | "test";

nextEnv.loadEnvConfig(process.cwd());

const modeArg = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1];
const inferredMode =
  process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
    ? "production"
    : process.env.NODE_ENV === "test"
      ? "test"
      : "development";
const mode = (modeArg || inferredMode) as EnvironmentMode;

if (!(["development", "production", "test"] as string[]).includes(mode)) {
  console.error("Invalid --mode. Use development, production, or test.");
  process.exitCode = 1;
} else {
  const errors = envConfig.validateEnvironment(process.env, mode);
  if (errors.length > 0) {
    console.error(`Environment is not ready for ${mode}:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Environment is ready for ${mode}.`);
  }
}
