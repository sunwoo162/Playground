import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDatabase(connectionString: string) {
  const nextPool = new Pool({ connectionString, max: 10 });
  const nextDatabase = drizzle({ client: nextPool, schema });
  return { pool: nextPool, database: nextDatabase };
}

type Database = ReturnType<typeof createDatabase>["database"];

let pool: Pool | undefined;
let database: Database | undefined;

export function getDb(): Database {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const created = createDatabase(connectionString);
  pool = created.pool;
  database = created.database;
  return database;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
