/**
 * Returns only the fields whose value changed, as `{ field: { from, to } }`.
 * Values are compared by their JSON form, so arrays (e.g. sorted id lists)
 * and dates compare by content.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  return changes;
}

/** Escapes %, _ and \ so user input is matched literally inside ILIKE. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
