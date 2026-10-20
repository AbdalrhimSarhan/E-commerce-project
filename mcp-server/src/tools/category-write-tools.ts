import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { ApiClient } from '../api-client.ts';
import type { CategoryDetail, Deleted } from './api-types.ts';
import { categoryDescription, categoryName, id, productIdList } from './schemas.ts';
import { runTool } from './tool-runner.ts';

const PERMISSION =
  'Permission: super_admin, admin or agent (FORBIDDEN otherwise). Every change is written to the audit log by the API.';

const linkSummary = (category: CategoryDetail): string =>
  `Category "${category.name}" now has ${category.productCount} products.`;

/**
 * Category write tools: exactly what the API allows the agent role.
 * There are NO product write tools: the API forbids product writes for
 * agents, and least privilege means not offering tools the agent cannot use.
 */
export function registerCategoryWriteTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    'create_category',
    {
      title: 'Create a category',
      description:
        'Create a category, optionally with products already in it. The name must be unique ignoring case (CONFLICT otherwise); ' +
        `unknown product ids give VALIDATION_ERROR and nothing is created. ${PERMISSION}`,
      inputSchema: z.object({
        name: categoryName,
        description: categoryDescription.optional(),
        productIds: productIdList(0).optional(),
      }),
      annotations: {
        title: 'Create a category',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) =>
      runTool(
        'create_category',
        () => api.request<CategoryDetail>({ method: 'POST', path: '/categories', body: args }),
        (category) => ({
          summary: `Created category "${category.name}" (${category.id}) with ${category.productCount} products.`,
          structured: { category },
        }),
      ),
  );

  server.registerTool(
    'update_category',
    {
      title: 'Update a category',
      description:
        'Rename a category and/or change its description (send at least one of name, description; null clears the description). ' +
        `Products in the category are not changed. Name taken: CONFLICT. Unknown id: NOT_FOUND. ${PERMISSION}`,
      inputSchema: z
        .object({
          id: id('category id'),
          name: categoryName.optional(),
          description: categoryDescription.optional(),
        })
        .refine((value) => value.name !== undefined || value.description !== undefined, {
          error: 'send at least one of name, description',
        }),
      annotations: {
        title: 'Update a category',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id: categoryId, ...changes }) =>
      runTool(
        'update_category',
        () => api.request<CategoryDetail>({ method: 'PATCH', path: `/categories/${categoryId}`, body: changes }),
        (category) => ({
          summary: `Updated category "${category.name}" (${category.id}).`,
          structured: { category },
        }),
      ),
  );

  server.registerTool(
    'delete_category',
    {
      title: 'Delete a category',
      description:
        'Delete a category permanently. Its product links are removed; the products themselves are NOT deleted. ' +
        `Unknown id: NOT_FOUND. ${PERMISSION}`,
      inputSchema: z.object({ id: id('category id') }),
      annotations: {
        title: 'Delete a category',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id: categoryId }) =>
      runTool(
        'delete_category',
        () => api.request<Deleted>({ method: 'DELETE', path: `/categories/${categoryId}` }),
        (deleted) => ({ summary: `Deleted category ${deleted.id}.`, structured: { deleted } }),
      ),
  );

  server.registerTool(
    'add_products_to_category',
    {
      title: 'Add products to a category',
      description:
        'Put products into a category. Products already in it are skipped, so repeating the call is safe. ' +
        `Unknown product ids: VALIDATION_ERROR (nothing is added). Unknown category: NOT_FOUND. ${PERMISSION}`,
      inputSchema: z.object({
        categoryId: id('category id'),
        productIds: productIdList(1),
      }),
      annotations: {
        title: 'Add products to a category',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ categoryId, productIds }) =>
      runTool(
        'add_products_to_category',
        () =>
          api.request<CategoryDetail>({
            method: 'POST',
            path: `/categories/${categoryId}/products`,
            body: { productIds },
          }),
        (category) => ({ summary: linkSummary(category), structured: { category } }),
      ),
  );

  server.registerTool(
    'replace_category_products',
    {
      title: 'Replace the products of a category',
      description:
        'Make the category contain EXACTLY these products: missing ones are added, all others are removed from it ' +
        '(an empty list removes every product). Products themselves are never deleted. ' +
        `Unknown product ids: VALIDATION_ERROR (nothing changes). Unknown category: NOT_FOUND. ${PERMISSION}`,
      inputSchema: z.object({
        categoryId: id('category id'),
        productIds: productIdList(0),
      }),
      annotations: {
        title: 'Replace the products of a category',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ categoryId, productIds }) =>
      runTool(
        'replace_category_products',
        () =>
          api.request<CategoryDetail>({
            method: 'PUT',
            path: `/categories/${categoryId}/products`,
            body: { productIds },
          }),
        (category) => ({ summary: linkSummary(category), structured: { category } }),
      ),
  );

  server.registerTool(
    'remove_product_from_category',
    {
      title: 'Remove a product from a category',
      description:
        'Take one product out of a category (the product itself is not deleted). ' +
        `If the product is not in the category: NOT_FOUND. ${PERMISSION}`,
      inputSchema: z.object({
        categoryId: id('category id'),
        productId: id('product id'),
      }),
      annotations: {
        title: 'Remove a product from a category',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ categoryId, productId }) =>
      runTool(
        'remove_product_from_category',
        () =>
          api.request<CategoryDetail>({
            method: 'DELETE',
            path: `/categories/${categoryId}/products/${productId}`,
          }),
        (category) => ({ summary: linkSummary(category), structured: { category } }),
      ),
  );
}
