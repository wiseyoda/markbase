import nextEnv from "@next/env";
import { initDb, getDbSchemaStatus, resetDb } from "../src/lib/db";

nextEnv.loadEnvConfig(process.cwd());

try {
  await initDb();
  const status = await getDbSchemaStatus();
  if (!status.ready) {
    throw new Error(
      `Migration incomplete; missing tables: ${status.missingTables.join(", ") || "none"}; missing columns: ${status.missingColumns.join(", ") || "none"}`,
    );
  }
  console.log("Database schema is ready.");
} finally {
  await resetDb();
}
