import { parseArgs } from "node:util";
import { createDbClient } from "../../db/client.js";
import { initializeDatabase } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { ProjectService } from "../../services/project-service.js";

const HELP = `
Usage: mcp-todos init

Initialize/register the current directory as a project.

This is optional - projects are auto-created when you add your first todo.
Use this to explicitly register a project or to see the detected project info.

Options:
  -h, --help    Show this help message

Examples:
  mcp-todos init
`;

export async function initCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const db = createDbClient();
  const repo = new TodoRepository(db);

  try {
    await initializeDatabase(db);
    const projectService = new ProjectService(repo);

    const project = await projectService.initProject(process.cwd());
    const stats = await projectService.getProjectStats(project.id);

    console.log(`Project: ${project.name}`);
    console.log(`Path:    ${project.rootPath}`);
    if (project.gitRemote) {
      console.log(`Remote:  ${project.gitRemote}`);
    }
    console.log(
      `\nTodos: ${stats.open} open, ${stats.inProgress} in progress, ${stats.done} done`,
    );
  } finally {
    await repo.close();
  }
}
