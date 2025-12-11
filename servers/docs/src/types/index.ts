export type SourceType = "llms_txt" | "firecrawl";

export interface DocSource {
  name: string;
  type: SourceType;
  url: string;
  /** Description of what this documentation source covers (for tool discovery) */
  description?: string;
  /** Group name for grouping multiple sources under a single search tool */
  groupName?: string;
  options?: {
    crawlLimit?: number;
    includeOptional?: boolean;
    // Firecrawl path filtering
    includePaths?: string[];
    excludePaths?: string[];
  };
}

export interface Source {
  id: number;
  name: string;
  type: SourceType;
  base_url: string;
  last_ingested_at: string | null;
  created_at: string;
}

export interface Document {
  id: number;
  source_id: number;
  url: string;
  title: string;
  path: string | null;
  content: string;
  content_hash: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: number;
  document_id: number;
  chunk_index: number;
  content: string;
  embedding: Float32Array | null;
  token_count: number | null;
  created_at: string;
}

export interface LlmsTxtEntry {
  title: string;
  url: string;
  description?: string;
  section: string;
  isOptional: boolean;
}

export interface FetchedDocument {
  url: string;
  title: string;
  content: string;
  path?: string;
  metadata?: Record<string, unknown>;
}
