/**
 * Memory subsystem contracts. Memory is orchestration-layer state: the engine
 * never reads or writes it directly. Today the default store is markdown files;
 * later a RAG/vector store can implement the same read/write seam and add search.
 */

export type MemoryScope = "global" | "project";

export interface MemorySearchQuery {
  query: string;
  scope?: MemoryScope;
  limit?: number;
}

export interface MemorySearchHit {
  id: string;
  scope: MemoryScope;
  text: string;
  score?: number;
  metadata?: Record<string, string>;
}

export interface MemoryStore {
  /** Whether this store has a backing target for the requested scope. */
  supports(scope: MemoryScope): boolean;
  /** Human label used in tool responses. */
  label(scope: MemoryScope): string;
  /** Read the complete memory document for the scope. Missing files read as empty. */
  read(scope: MemoryScope): Promise<string>;
  /** Replace the complete memory document for the scope. */
  write(scope: MemoryScope, text: string): Promise<void>;
  /**
   * Optional future RAG seam. Plain markdown stores may omit this; vector stores
   * can implement retrieval without changing the engine or MemoryTool contract.
   */
  search?(query: MemorySearchQuery): Promise<MemorySearchHit[]>;
}
