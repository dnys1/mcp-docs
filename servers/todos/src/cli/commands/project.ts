import { parseArgs } from "node:util";
import { TodosDatabase } from "../../db/client.js";
import { TodosMigrationService } from "../../db/migrations.js";
import { TodoRepository } from "../../db/repository.js";
import { ProjectService } from "../../services/project-service.js";
import type { Project } from "../../types/index.js";

const HELP = `
Usage: mcp-todos project <subcommand> [options]

Manage projects.

Subcommands:
  list              List all known projects
  show [name]       Show project details (defaults to current project)

Options:
  -h, --help        Show this help message

Examples:
  mcp-todos project list
  mcp-todos project show
  mcp-todos project show my-project
`;

async function listProjects(repo: TodoRepository): Promise<void> {
  const projectService = new ProjectService(repo);
  const projects = await projectService.listProjects();

  if (projects.length === 0) {
    console.log("No projects found.");
    console.log("Projects are auto-created when you add your first todo.");
    return;
  }

  console.log("Projects:\n");
  for (const project of projects) {
    const stats = await projectService.getProjectStats(project.id);
    console.log(`  ${project.name}`);
    console.log(`    Path: ${project.rootPath}`);
    console.log(
      `    Todos: ${stats.open} open, ${stats.inProgress} in progress, ${stats.done} done`,
    );
    console.log();
  }
}

async function showProject(repo: TodoRepository, name?: string): Promise<void> {
  const projectService = new ProjectService(repo);

  let project: Project;
  if (name) {
    const found = await projectService.getProjectByName(name);
    if (!found) {
      console.error(`Error: Project '${name}' not found`);
      process.exit(1);
    }
    project = found;
  } else {
    project = await projectService.getOrCreateProject(process.cwd());
  }

  const stats = await projectService.getProjectStats(project.id);

  console.log(`Project: ${project.name}`);
  console.log(`Path:    ${project.rootPath}`);
  if (project.gitRemote) {
    console.log(`Remote:  ${project.gitRemote}`);
  }
  console.log(`Created: ${project.createdAt}`);
  console.log(
    `\nTodos: ${stats.open} open, ${stats.inProgress} in progress, ${stats.done} done`,
  );
}

export async function projectCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
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

  const subcommand = positionals[0];

  if (!subcommand) {
    console.error("Error: Subcommand required");
    console.log(HELP);
    process.exit(1);
  }

  const db = new TodosDatabase();
  const repo = new TodoRepository(db.client);

  try {
    const migrationService = new TodosMigrationService(db.client);
    await migrationService.initialize();

    switch (subcommand) {
      case "list":
      case "ls":
        await listProjects(repo);
        break;
      case "show":
        await showProject(repo, positionals[1]);
        break;
      default:
        console.error(`Error: Unknown subcommand '${subcommand}'`);
        console.log(HELP);
        process.exit(1);
    }
  } finally {
    await repo.close();
  }
}
