import type { Client } from "@libsql/client";
import { SCHEMA } from "./schema.js";

export async function initializeDatabase(db: Client): Promise<void> {
  // Create tables
  await db.execute(SCHEMA.projects);
  await db.execute(SCHEMA.todos);

  // Create indexes
  await db.execute(SCHEMA.projectsGitRemoteIndex);
  await db.execute(SCHEMA.projectsRootPathIndex);
  await db.execute(SCHEMA.todosProjectStatusIndex);
  await db.execute(SCHEMA.todosStatusIndex);
}
