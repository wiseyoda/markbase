import nextEnv from "@next/env";
import { getDbSchemaStatus, resetDb } from "../src/lib/db";

nextEnv.loadEnvConfig(process.cwd());

try {
  const status = await getDbSchemaStatus();
  if (!status.ready) {
    console.error(`Database schema is not ready. Missing tables: ${status.missingTables.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Database schema is ready.");
  }
} finally {
  await resetDb();
}
