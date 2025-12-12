import type { Client } from "@libsql/client";
import { SCHEMA } from "./schema.js";

export class TodosMigrationService {
  constructor(private readonly db: Client) {}

  async initialize(): Promise<void> {
    // Create tables
    await this.db.execute(SCHEMA.projects);
    await this.db.execute(SCHEMA.todos);

    // Create indexes
    await this.db.execute(SCHEMA.projectsGitRemoteIndex);
    await this.db.execute(SCHEMA.projectsRootPathIndex);
    await this.db.execute(SCHEMA.todosProjectStatusIndex);
    await this.db.execute(SCHEMA.todosStatusIndex);
  }
}
