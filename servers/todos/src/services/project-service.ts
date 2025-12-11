import { execSync } from "node:child_process";
import { basename } from "node:path";
import { logger } from "@mcp/shared/logger";
import type { TodoRepository } from "../db/repository.js";
import type { Project } from "../types/index.js";
import { generateId } from "../utils/id.js";

type GitInfo = {
  rootPath: string;
  remote: string | null;
};

export class ProjectService {
  private log = logger.child({ service: "ProjectService" });

  constructor(private repo: TodoRepository) {}

  /**
   * Get git repository info for a directory.
   * Returns null if not in a git repo.
   */
  private getGitInfo(cwd: string): GitInfo | null {
    try {
      const rootPath = execSync("git rev-parse --show-toplevel", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      let remote: string | null = null;
      try {
        remote = execSync("git config --get remote.origin.url", {
          cwd,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
      } catch {
        // No remote configured
      }

      return { rootPath, remote };
    } catch {
      // Not a git repository
      return null;
    }
  }

  /**
   * Detect or create a project for the given directory.
   * Uses git remote URL for worktree matching.
   */
  async getOrCreateProject(cwd: string): Promise<Project> {
    const gitInfo = this.getGitInfo(cwd);

    if (gitInfo) {
      // Git repo - check for existing project by remote first (worktree support)
      if (gitInfo.remote) {
        const existing = await this.repo.findProjectByRemote(gitInfo.remote);
        if (existing) {
          this.log.debug("Found project by remote", {
            project: existing.name,
            remote: gitInfo.remote,
          });
          return existing;
        }
      }

      // Check by root path
      const byPath = await this.repo.findProjectByPath(gitInfo.rootPath);
      if (byPath) {
        this.log.debug("Found project by path", {
          project: byPath.name,
          path: gitInfo.rootPath,
        });
        return byPath;
      }

      // Create new project
      const name = basename(gitInfo.rootPath);
      const project = await this.repo.createProject(
        generateId(),
        name,
        gitInfo.rootPath,
        gitInfo.remote,
      );
      this.log.info("Created new project", {
        project: project.name,
        path: gitInfo.rootPath,
        remote: gitInfo.remote,
      });
      return project;
    }

    // Not a git repo - use cwd directly
    const existing = await this.repo.findProjectByPath(cwd);
    if (existing) {
      this.log.debug("Found project by path (non-git)", {
        project: existing.name,
        path: cwd,
      });
      return existing;
    }

    // Create new project
    const name = basename(cwd);
    const project = await this.repo.createProject(
      generateId(),
      name,
      cwd,
      null,
    );
    this.log.info("Created new project (non-git)", {
      project: project.name,
      path: cwd,
    });
    return project;
  }

  /**
   * Initialize/register a project for the given directory.
   * Same as getOrCreateProject but intended for explicit init command.
   */
  async initProject(cwd: string): Promise<Project> {
    return this.getOrCreateProject(cwd);
  }

  /**
   * List all known projects.
   */
  async listProjects(): Promise<Project[]> {
    return this.repo.listProjects();
  }

  /**
   * Get a project by name.
   */
  async getProjectByName(name: string): Promise<Project | null> {
    return this.repo.findProjectByName(name);
  }

  /**
   * Get a project by ID.
   */
  async getProjectById(id: string): Promise<Project | null> {
    return this.repo.findProjectById(id);
  }

  /**
   * Update a project's display name.
   */
  async renameProject(id: string, newName: string): Promise<void> {
    await this.repo.updateProjectName(id, newName);
  }

  /**
   * Get todo statistics for a project.
   */
  async getProjectStats(
    projectId: string,
  ): Promise<{ open: number; inProgress: number; done: number }> {
    return this.repo.getProjectTodoStats(projectId);
  }
}
