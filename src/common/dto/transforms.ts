import type { TransformFnParams } from 'class-transformer';

// Small, reusable class-transformer helpers for DTOs.

/** Trims strings; other values are left for the validators to reject. */
export function trim({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Query strings are text: "true"/"false" become booleans, anything else stays and fails @IsBoolean. */
export function toBooleanQuery({ value }: TransformFnParams): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

/** Trims; an empty string becomes null (used to clear optional text fields). */
export function trimToNull({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
