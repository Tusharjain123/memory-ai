import * as SQLite from "expo-sqlite";
import {
  DATABASE_NAME,
  MIGRATION_1,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  SCHEMA_VERSION,
} from "./schema";

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= initializeDatabase();
  return databasePromise;
}

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  const result = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let version = result?.user_version ?? 0;
  if (version < 1) {
    await database.execAsync(MIGRATION_1);
    await database.execAsync("PRAGMA user_version = 1");
    version = 1;
  }
  if (version < 2) {
    await database.execAsync(MIGRATION_2);
    await database.execAsync("PRAGMA user_version = 2");
    version = 2;
  }
  if (version < 3) {
    await database.execAsync(MIGRATION_3);
    await database.execAsync("PRAGMA user_version = 3");
    version = 3;
  }
  if (version < 4) {
    await database.execAsync(MIGRATION_4);
    await database.execAsync("PRAGMA user_version = 4");
    version = 4;
  }
  if (version > SCHEMA_VERSION) {
    throw new Error("This database was created by a newer version of Memory AI");
  }
  return database;
}
