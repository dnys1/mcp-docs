/**
 * Configuration types for MCP server registration.
 */

export type EnvVarConfig = {
  /** Environment variable name (e.g., "OPENAI_API_KEY") */
  name: string;
  /** Description shown to user */
  description: string;
  /** If true, warn when skipped */
  required: boolean;
  /** URL where user can get the value */
  helpUrl?: string;
};

export type McpServerConfig = {
  /** Server name for registration (e.g., "mcp-todos") */
  name: string;
  /** Absolute path to the project directory */
  projectDir: string;
  /** Optional environment variables to prompt for */
  envVars?: EnvVarConfig[];
  /** Custom help text (overrides default) */
  helpText?: string;
};

export type VSCodeMCPConfig = {
  servers: Record<
    string,
    {
      type: "stdio" | "http";
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
    }
  >;
  inputs: unknown[];
};

export type ResolvedEnvVars = Record<string, string>;
