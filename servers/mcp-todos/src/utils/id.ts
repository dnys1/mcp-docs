import { randomUUID } from "node:crypto";

/**
 * Generate a new UUID.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Get the short display version of an ID (first 6 characters).
 */
export function shortId(id: string): string {
  return id.slice(0, 6);
}

/**
 * Format a todo for display with short ID.
 */
export function formatTodoId(id: string): string {
  return shortId(id);
}
