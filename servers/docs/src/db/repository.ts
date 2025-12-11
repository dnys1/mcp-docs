import type { Client } from "@libsql/client";

export interface SourceRow {
  id: number;
  name: string;
  type: string;
  base_url: string;
  last_ingested_at: string | null;
  doc_count?: number;
  group_name: string | null;
  description: string | null;
}

export interface SourceWithOptions {
  id: number;
  name: string;
  type: string;
  base_url: string;
  options: string | null;
  group_name: string | null;
  description: string | null;
}

export interface DocumentRow {
  id: number;
  source_id: number;
  url: string;
  title: string;
  path: string | null;
  content: string;
  content_hash: string;
  metadata: string | null;
}

export interface ChunkSearchResult {
  document_id: number;
  chunk_content: string;
  title: string;
  url: string;
  path: string | null;
  source_name: string;
  distance: number;
}

export interface SourceStats {
  id: number;
  name: string;
  type: string;
  base_url: string;
  last_ingested_at: string | null;
  document_count: number;
  chunk_count: number;
  group_name: string | null;
  description: string | null;
}

export interface IngestionProgress {
  id: number;
  processedDocuments: number;
  skippedDocuments: number;
  failedDocuments: number;
  lastProcessedUrl: string | null;
}

/**
 * Repository for all database operations.
 * Encapsulates raw SQL queries and provides typed methods.
 */
export class DocsRepository {
  constructor(private db: Client) {}

  // ============ Sources ============

  async listSources(): Promise<SourceRow[]> {
    const result = await this.db.execute(`
      SELECT s.id, s.name, s.type, s.base_url, s.last_ingested_at, s.group_name, s.description, COUNT(d.id) as doc_count
      FROM sources s
      LEFT JOIN documents d ON d.source_id = s.id
      GROUP BY s.id
      ORDER BY COALESCE(s.group_name, s.name), s.name
    `);

    return result.rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      type: row.type as string,
      base_url: row.base_url as string,
      last_ingested_at: row.last_ingested_at as string | null,
      doc_count: row.doc_count as number,
      group_name: row.group_name as string | null,
      description: row.description as string | null,
    }));
  }

  async getSourceStats(): Promise<SourceStats[]> {
    const result = await this.db.execute(`
      SELECT
        s.id,
        s.name,
        s.type,
        s.base_url,
        s.last_ingested_at,
        s.group_name,
        s.description,
        COUNT(DISTINCT d.id) as document_count,
        COUNT(c.id) as chunk_count
      FROM sources s
      LEFT JOIN documents d ON d.source_id = s.id
      LEFT JOIN chunks c ON c.document_id = d.id
      GROUP BY s.id
      ORDER BY COALESCE(s.group_name, s.name), s.name
    `);

    return result.rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      type: row.type as string,
      base_url: row.base_url as string,
      last_ingested_at: row.last_ingested_at as string | null,
      document_count: row.document_count as number,
      chunk_count: row.chunk_count as number,
      group_name: row.group_name as string | null,
      description: row.description as string | null,
    }));
  }

  async upsertSource(source: {
    name: string;
    type: string;
    baseUrl: string;
    options?: string | null;
    groupName?: string | null;
    description?: string | null;
  }): Promise<number> {
    const result = await this.db.execute({
      sql: `
        INSERT INTO sources (name, type, base_url, options, group_name, description)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          type = excluded.type,
          base_url = excluded.base_url,
          options = excluded.options,
          group_name = excluded.group_name,
          description = excluded.description
        RETURNING id
      `,
      args: [
        source.name,
        source.type,
        source.baseUrl,
        source.options ?? null,
        source.groupName ?? null,
        source.description ?? null,
      ],
    });

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to upsert source");
    }
    return row.id as number;
  }

  async updateSourceIngestedAt(sourceId: number): Promise<void> {
    await this.db.execute({
      sql: `UPDATE sources SET last_ingested_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [sourceId],
    });
  }

  async getSourceByName(name: string): Promise<SourceWithOptions | null> {
    const result = await this.db.execute({
      sql: `SELECT id, name, type, base_url, options, group_name, description FROM sources WHERE name = ?`,
      args: [name],
    });

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id as number,
      name: row.name as string,
      type: row.type as string,
      base_url: row.base_url as string,
      options: row.options as string | null,
      group_name: row.group_name as string | null,
      description: row.description as string | null,
    };
  }

  async listSourcesWithOptions(): Promise<SourceWithOptions[]> {
    const result = await this.db.execute(`
			SELECT id, name, type, base_url, options, group_name, description
			FROM sources
			ORDER BY COALESCE(group_name, name), name
		`);

    return result.rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      type: row.type as string,
      base_url: row.base_url as string,
      options: row.options as string | null,
      group_name: row.group_name as string | null,
      description: row.description as string | null,
    }));
  }

  async removeSource(name: string): Promise<boolean> {
    // First delete related data
    await this.db.execute({
      sql: `DELETE FROM chunks WHERE document_id IN (
				SELECT d.id FROM documents d
				JOIN sources s ON s.id = d.source_id
				WHERE s.name = ?
			)`,
      args: [name],
    });

    await this.db.execute({
      sql: `DELETE FROM documents WHERE source_id IN (
				SELECT id FROM sources WHERE name = ?
			)`,
      args: [name],
    });

    await this.db.execute({
      sql: `DELETE FROM ingestion_progress WHERE source_id IN (
				SELECT id FROM sources WHERE name = ?
			)`,
      args: [name],
    });

    const result = await this.db.execute({
      sql: `DELETE FROM sources WHERE name = ? RETURNING id`,
      args: [name],
    });

    return result.rows.length > 0;
  }

  /**
   * Check if a name refers to a group (not a source with that name).
   * Returns false if there's a source with exactly that name.
   */
  async isGroup(name: string): Promise<boolean> {
    // First check if there's a source with this exact name
    const sourceResult = await this.db.execute({
      sql: `SELECT id FROM sources WHERE name = ?`,
      args: [name],
    });
    if (sourceResult.rows.length > 0) {
      // There's a source with this name - it's not a group reference
      return false;
    }

    // Check if any sources use this as their group_name
    const groupResult = await this.db.execute({
      sql: `SELECT COUNT(*) as count FROM sources WHERE group_name = ?`,
      args: [name],
    });
    return (groupResult.rows[0]?.count as number) > 0;
  }

  /**
   * Get all sources in a group.
   */
  async getSourcesByGroup(groupName: string): Promise<SourceWithOptions[]> {
    const result = await this.db.execute({
      sql: `SELECT id, name, type, base_url, options, group_name, description
            FROM sources WHERE group_name = ? ORDER BY name`,
      args: [groupName],
    });

    return result.rows.map((row) => ({
      id: row.id as number,
      name: row.name as string,
      type: row.type as string,
      base_url: row.base_url as string,
      options: row.options as string | null,
      group_name: row.group_name as string | null,
      description: row.description as string | null,
    }));
  }

  /**
   * Remove all sources in a group.
   */
  async removeGroup(groupName: string): Promise<string[]> {
    const sources = await this.getSourcesByGroup(groupName);
    const removedNames: string[] = [];

    for (const source of sources) {
      await this.removeSource(source.name);
      removedNames.push(source.name);
    }

    return removedNames;
  }

  /**
   * Get distinct group names.
   */
  async listGroups(): Promise<string[]> {
    const result = await this.db.execute(`
      SELECT DISTINCT group_name FROM sources
      WHERE group_name IS NOT NULL
      ORDER BY group_name
    `);

    return result.rows.map((row) => row.group_name as string);
  }

  /**
   * Update a source's description.
   */
  async updateSourceDescription(
    name: string,
    description: string,
  ): Promise<void> {
    await this.db.execute({
      sql: `UPDATE sources SET description = ? WHERE name = ?`,
      args: [description, name],
    });
  }

  // ============ Documents ============

  async listDocuments(
    sourceName: string,
    options?: { section?: string },
  ): Promise<DocumentRow[]> {
    let sql = `
      SELECT d.id, d.source_id, d.url, d.title, d.path, d.content, d.content_hash, d.metadata
      FROM documents d
      JOIN sources s ON s.id = d.source_id
      WHERE s.name = ?
    `;
    const args: (string | number)[] = [sourceName];

    if (options?.section) {
      sql += ` AND json_extract(d.metadata, '$.section') LIKE ?`;
      args.push(`%${options.section}%`);
    }

    sql += ` ORDER BY d.path, d.title`;

    const result = await this.db.execute({ sql, args });

    return result.rows.map((row) => ({
      id: row.id as number,
      source_id: row.source_id as number,
      url: row.url as string,
      title: row.title as string,
      path: row.path as string | null,
      content: row.content as string,
      content_hash: row.content_hash as string,
      metadata: row.metadata as string | null,
    }));
  }

  async getDocumentByPath(
    sourceName: string,
    path: string,
  ): Promise<DocumentRow | null> {
    const result = await this.db.execute({
      sql: `
        SELECT d.id, d.source_id, d.url, d.title, d.path, d.content, d.content_hash, d.metadata
        FROM documents d
        JOIN sources s ON s.id = d.source_id
        WHERE s.name = ? AND d.path = ?
      `,
      args: [sourceName, path],
    });

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id as number,
      source_id: row.source_id as number,
      url: row.url as string,
      title: row.title as string,
      path: row.path as string | null,
      content: row.content as string,
      content_hash: row.content_hash as string,
      metadata: row.metadata as string | null,
    };
  }

  async searchDocumentsByTitle(
    sourceName: string,
    titleQuery: string,
    limit: number = 5,
  ): Promise<DocumentRow[]> {
    const result = await this.db.execute({
      sql: `
        SELECT d.id, d.source_id, d.url, d.title, d.path, d.content, d.content_hash, d.metadata
        FROM documents d
        JOIN sources s ON s.id = d.source_id
        WHERE s.name = ? AND d.title LIKE ? COLLATE NOCASE
        ORDER BY d.title
        LIMIT ?
      `,
      args: [sourceName, `%${titleQuery}%`, limit],
    });

    return result.rows.map((row) => ({
      id: row.id as number,
      source_id: row.source_id as number,
      url: row.url as string,
      title: row.title as string,
      path: row.path as string | null,
      content: row.content as string,
      content_hash: row.content_hash as string,
      metadata: row.metadata as string | null,
    }));
  }

  async getDocumentByUrl(
    sourceId: number,
    url: string,
  ): Promise<{ content_hash: string } | null> {
    const result = await this.db.execute({
      sql: `SELECT content_hash FROM documents WHERE source_id = ? AND url = ?`,
      args: [sourceId, url],
    });

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    if (!row) return null;

    return { content_hash: row.content_hash as string };
  }

  /**
   * Get all document URLs for a source (for cache exclusion).
   */
  async getDocumentUrls(sourceId: number): Promise<string[]> {
    const result = await this.db.execute({
      sql: `SELECT url FROM documents WHERE source_id = ?`,
      args: [sourceId],
    });

    return result.rows.map((row) => row.url as string);
  }

  /**
   * Get documents by their IDs.
   */
  async getDocumentsByIds(documentIds: number[]): Promise<DocumentRow[]> {
    if (documentIds.length === 0) {
      return [];
    }

    const placeholders = documentIds.map(() => "?").join(", ");
    const result = await this.db.execute({
      sql: `SELECT id, source_id, url, title, path, content, content_hash, metadata
            FROM documents WHERE id IN (${placeholders})`,
      args: documentIds,
    });

    return result.rows.map((row) => ({
      id: row.id as number,
      source_id: row.source_id as number,
      url: row.url as string,
      title: row.title as string,
      path: row.path as string | null,
      content: row.content as string,
      content_hash: row.content_hash as string,
      metadata: row.metadata as string | null,
    }));
  }

  async upsertDocument(doc: {
    sourceId: number;
    url: string;
    title: string;
    path: string | null;
    content: string;
    contentHash: string;
    metadata: string | null;
  }): Promise<number> {
    // Delete existing chunks first
    await this.db.execute({
      sql: `DELETE FROM chunks WHERE document_id IN (
        SELECT id FROM documents WHERE source_id = ? AND url = ?
      )`,
      args: [doc.sourceId, doc.url],
    });

    const result = await this.db.execute({
      sql: `
        INSERT INTO documents (source_id, url, title, path, content, content_hash, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source_id, url) DO UPDATE SET
          title = excluded.title,
          path = excluded.path,
          content = excluded.content,
          content_hash = excluded.content_hash,
          metadata = excluded.metadata,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `,
      args: [
        doc.sourceId,
        doc.url,
        doc.title,
        doc.path,
        doc.content,
        doc.contentHash,
        doc.metadata,
      ],
    });

    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to upsert document");
    }
    return row.id as number;
  }

  // ============ Chunks ============

  async searchChunks(
    embedding: number[],
    options?: {
      source?: string;
      section?: string;
      pathPrefix?: string;
      limit?: number;
    },
  ): Promise<ChunkSearchResult[]> {
    const embeddingArray = new Float32Array(embedding);
    const vectorJson = JSON.stringify(Array.from(embeddingArray));

    let sql = `
      SELECT
        d.id as document_id,
        c.content as chunk_content,
        d.title,
        d.url,
        d.path,
        s.name as source_name,
        vector_distance_cos(c.embedding, vector32(?)) as distance
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      JOIN sources s ON s.id = d.source_id
    `;

    const args: (string | number)[] = [vectorJson];
    const conditions: string[] = [];

    if (options?.source) {
      conditions.push(`s.name = ?`);
      args.push(options.source);
    }

    if (options?.section) {
      conditions.push(`json_extract(d.metadata, '$.section') LIKE ?`);
      args.push(`%${options.section}%`);
    }

    if (options?.pathPrefix) {
      conditions.push(`d.path LIKE ?`);
      args.push(`${options.pathPrefix}%`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += `
      ORDER BY distance ASC
      LIMIT ?
    `;
    args.push(options?.limit ?? 5);

    const result = await this.db.execute({ sql, args });

    return result.rows.map((row) => ({
      document_id: row.document_id as number,
      chunk_content: row.chunk_content as string,
      title: row.title as string,
      url: row.url as string,
      path: row.path as string | null,
      source_name: row.source_name as string,
      distance: row.distance as number,
    }));
  }

  /**
   * Search chunks using FTS5 (keyword/BM25 search).
   * Returns results ranked by relevance score.
   */
  async searchChunksFts(
    query: string,
    options?: {
      source?: string;
      section?: string;
      pathPrefix?: string;
      limit?: number;
    },
  ): Promise<ChunkSearchResult[]> {
    // Escape FTS5 special characters and prepare query
    const ftsQuery = this.prepareFtsQuery(query);

    let sql = `
      SELECT
        d.id as document_id,
        c.content as chunk_content,
        d.title,
        d.url,
        d.path,
        s.name as source_name,
        bm25(chunks_fts) as score
      FROM chunks_fts fts
      JOIN chunks c ON c.id = fts.rowid
      JOIN documents d ON d.id = c.document_id
      JOIN sources s ON s.id = d.source_id
      WHERE chunks_fts MATCH ?
    `;

    const args: (string | number)[] = [ftsQuery];

    if (options?.source) {
      sql += ` AND s.name = ?`;
      args.push(options.source);
    }

    if (options?.section) {
      sql += ` AND json_extract(d.metadata, '$.section') LIKE ?`;
      args.push(`%${options.section}%`);
    }

    if (options?.pathPrefix) {
      sql += ` AND d.path LIKE ?`;
      args.push(`${options.pathPrefix}%`);
    }

    sql += `
      ORDER BY score ASC
      LIMIT ?
    `;
    args.push(options?.limit ?? 5);

    const result = await this.db.execute({ sql, args });

    return result.rows.map((row) => ({
      document_id: row.document_id as number,
      chunk_content: row.chunk_content as string,
      title: row.title as string,
      url: row.url as string,
      path: row.path as string | null,
      source_name: row.source_name as string,
      distance: Math.abs(row.score as number), // BM25 returns negative scores
    }));
  }

  /**
   * Hybrid search combining vector and FTS5 results using Reciprocal Rank Fusion.
   */
  async searchChunksHybrid(
    embedding: number[],
    query: string,
    options?: {
      source?: string;
      section?: string;
      pathPrefix?: string;
      limit?: number;
      vectorWeight?: number; // 0-1, default 0.5
    },
  ): Promise<ChunkSearchResult[]> {
    const limit = options?.limit ?? 5;
    const k = 60; // RRF constant

    // Fetch more results for fusion
    const fetchLimit = Math.max(limit * 3, 15);

    // Run both searches in parallel
    const [vectorResults, ftsResults] = await Promise.all([
      this.searchChunks(embedding, { ...options, limit: fetchLimit }),
      this.searchChunksFts(query, { ...options, limit: fetchLimit }),
    ]);

    // If FTS returns nothing, fall back to vector-only
    if (ftsResults.length === 0) {
      return vectorResults.slice(0, limit);
    }

    // Build RRF scores
    const scores = new Map<
      string,
      { result: ChunkSearchResult; score: number }
    >();

    // Score vector results
    vectorResults.forEach((result, rank) => {
      const key = `${result.url}:${result.chunk_content.slice(0, 100)}`;
      const rrfScore = 1 / (k + rank + 1);
      scores.set(key, { result, score: rrfScore });
    });

    // Score FTS results and combine
    ftsResults.forEach((result, rank) => {
      const key = `${result.url}:${result.chunk_content.slice(0, 100)}`;
      const rrfScore = 1 / (k + rank + 1);
      const existing = scores.get(key);
      if (existing) {
        existing.score += rrfScore; // Boost items found in both
      } else {
        scores.set(key, { result, score: rrfScore });
      }
    });

    // Sort by combined score and return top results
    const sorted = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return sorted.map((item) => ({
      ...item.result,
      distance: 1 - item.score, // Convert RRF score to "distance" for consistency
    }));
  }

  /**
   * Prepare a query for FTS5 MATCH syntax.
   */
  private prepareFtsQuery(query: string): string {
    // Remove special FTS5 characters and split into terms
    const cleaned = query.replace(/["()*\-+:^]/g, " ").trim();

    // Split into words and join with OR for broader matching
    const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
    if (terms.length === 0) return '""';

    // Use prefix matching for better recall
    return terms.map((t) => `"${t}"*`).join(" OR ");
  }

  async insertChunk(chunk: {
    documentId: number;
    chunkIndex: number;
    content: string;
    embedding: number[];
    tokenCount: number;
  }): Promise<void> {
    const embeddingArray = new Float32Array(chunk.embedding);

    await this.db.execute({
      sql: `
        INSERT INTO chunks (document_id, chunk_index, content, embedding, token_count)
        VALUES (?, ?, ?, vector32(?), ?)
        ON CONFLICT(document_id, chunk_index) DO UPDATE SET
          content = excluded.content,
          embedding = excluded.embedding,
          token_count = excluded.token_count
      `,
      args: [
        chunk.documentId,
        chunk.chunkIndex,
        chunk.content,
        JSON.stringify(Array.from(embeddingArray)),
        chunk.tokenCount,
      ],
    });
  }

  // ============ Ingestion Progress ============

  async getIncompleteProgress(
    sourceId: number,
  ): Promise<IngestionProgress | null> {
    try {
      const result = await this.db.execute({
        sql: `SELECT id, processed_documents, skipped_documents, failed_documents, last_processed_url
              FROM ingestion_progress
              WHERE source_id = ? AND status = 'in_progress'
              ORDER BY started_at DESC
              LIMIT 1`,
        args: [sourceId],
      });

      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id as number,
        processedDocuments: row.processed_documents as number,
        skippedDocuments: row.skipped_documents as number,
        failedDocuments: row.failed_documents as number,
        lastProcessedUrl: row.last_processed_url as string | null,
      };
    } catch {
      // Table may not exist
      return null;
    }
  }

  async createProgress(
    sourceId: number,
    totalDocuments: number,
  ): Promise<IngestionProgress> {
    const result = await this.db.execute({
      sql: `INSERT INTO ingestion_progress (source_id, total_documents)
            VALUES (?, ?)
            RETURNING id`,
      args: [sourceId, totalDocuments],
    });

    return {
      id: result.rows[0]?.id as number,
      processedDocuments: 0,
      skippedDocuments: 0,
      failedDocuments: 0,
      lastProcessedUrl: null,
    };
  }

  async updateProgress(
    progressId: number,
    data: {
      processedDocuments: number;
      skippedDocuments: number;
      failedDocuments: number;
      lastProcessedUrl: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.db.execute({
      sql: `UPDATE ingestion_progress
            SET processed_documents = ?,
                skipped_documents = ?,
                failed_documents = ?,
                last_processed_url = ?,
                error_message = COALESCE(?, error_message)
            WHERE id = ?`,
      args: [
        data.processedDocuments,
        data.skippedDocuments,
        data.failedDocuments,
        data.lastProcessedUrl,
        data.errorMessage || null,
        progressId,
      ],
    });
  }

  async completeProgress(
    progressId: number,
    status: "completed" | "completed_with_errors",
  ): Promise<void> {
    await this.db.execute({
      sql: `UPDATE ingestion_progress
            SET status = ?, completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [status, progressId],
    });
  }

  // ============ Stats ============

  async getTotalStats(): Promise<{
    sources: number;
    documents: number;
    chunks: number;
  }> {
    const result = await this.db.execute(`
      SELECT
        (SELECT COUNT(*) FROM sources) as source_count,
        (SELECT COUNT(*) FROM documents) as document_count,
        (SELECT COUNT(*) FROM chunks) as chunk_count
    `);

    const row = result.rows[0];
    return {
      sources: (row?.source_count as number) || 0,
      documents: (row?.document_count as number) || 0,
      chunks: (row?.chunk_count as number) || 0,
    };
  }

  // ============ Lifecycle ============

  async close(): Promise<void> {
    await this.db.close();
  }
}
