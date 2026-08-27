import nextEnv from "@next/env";
const loadedDbModule = await import("../src/lib/db");
const dbModule = (
  "default" in loadedDbModule ? loadedDbModule.default : loadedDbModule
) as typeof import("../src/lib/db");
const { initDb, getDbSchemaStatus, resetDb } = dbModule;

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
