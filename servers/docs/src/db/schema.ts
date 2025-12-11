import { EMBEDDING_DIMENSIONS } from "../config/embeddings.js";

export const SCHEMA = {
  sources: `
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      options TEXT,
      is_user_defined INTEGER DEFAULT 0,
      last_ingested_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      group_name TEXT,
      description TEXT
    )
  `,

  documents: `
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id),
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, url)
    )
  `,

  chunks: `
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id),
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding F32_BLOB(${EMBEDDING_DIMENSIONS}),
      token_count INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, chunk_index)
    )
  `,

  chunksIndex: `
    CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks (libsql_vector_idx(embedding, 'metric=cosine'))
  `,

  // FTS5 virtual table for keyword search (external content table linked to chunks)
  chunksFts: `
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content='chunks',
      content_rowid='id'
    )
  `,

  // Triggers to keep FTS table in sync with chunks table
  chunksFtsInsertTrigger: `
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, content)
      VALUES (new.id, new.content);
    END
  `,

  chunksFtsDeleteTrigger: `
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content)
      VALUES ('delete', old.id, old.content);
    END
  `,

  chunksFtsUpdateTrigger: `
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, content)
      VALUES ('delete', old.id, old.content);
      INSERT INTO chunks_fts(rowid, content)
      VALUES (new.id, new.content);
    END
  `,

  ingestionProgress: `
    CREATE TABLE IF NOT EXISTS ingestion_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id),
      total_documents INTEGER NOT NULL,
      processed_documents INTEGER DEFAULT 0,
      skipped_documents INTEGER DEFAULT 0,
      failed_documents INTEGER DEFAULT 0,
      status TEXT DEFAULT 'in_progress',
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      last_processed_url TEXT,
      error_message TEXT,
      UNIQUE(source_id, started_at)
    )
  `,
};
