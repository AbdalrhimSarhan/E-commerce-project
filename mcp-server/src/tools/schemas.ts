import * as z from 'zod';

/*
 * Input schemas that mirror the API's DTOs (same fields, same limits), so an
 * agent gets clear errors early. The API still validates everything again:
 * these schemas are a convenience, never the security boundary.
 */

/** The API accepts any UUID version (class-validator IsUUID('all')). */
export const id = (what: string) => z.guid({ error: `${what} must be a UUID` }).describe(`${what} (UUID)`);

/** Same limit as the API: at most 100 ids per request, no duplicates. */
export const MAX_LINKS_PER_REQUEST = 100;

export const productIdList = (minItems: number) =>
  z
    .array(id('product id'))
    .min(minItems)
    .max(MAX_LINKS_PER_REQUEST)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'productIds must not contain duplicates' })
    .describe(`Product ids (UUIDs), ${minItems}-${MAX_LINKS_PER_REQUEST}, no duplicates`);

export const page = z.number().int().min(1).optional().describe('Page number, starts at 1 (default 1)');
export const limit = z.number().int().min(1).max(100).optional().describe('Items per page, 1-100 (default 20)');

export const categoryName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe('Category name, 1-100 characters, unique (case-insensitive)');

export const categoryDescription = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .describe('Category description, up to 2000 characters; null or "" clears it');

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'price', 'createdAt'] as const;
