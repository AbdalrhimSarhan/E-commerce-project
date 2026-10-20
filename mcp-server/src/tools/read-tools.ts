import type { McpServer, ToolAnnotations } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { ApiClient } from '../api-client.ts';
import type { Category, CategoryDetail, Product } from './api-types.ts';
import { id, limit, page, PRODUCT_SORT_FIELDS } from './schemas.ts';
import { paginationOf, runTool } from './tool-runner.ts';

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Read tools. The API allows them for every role, including agent. */
export function registerReadTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    'list_products',
    {
      title: 'List products',
      description:
        'List products with their categories, paginated (newest first by default). ' +
        'Filter by a case-insensitive search on name or SKU, by category, or by active state, and sort by name, sku, price or createdAt. ' +
        'Read-only. Permission: any authenticated role (agent included).',
      inputSchema: z.object({
        page,
        limit,
        search: z.string().trim().max(100).optional().describe('Case-insensitive match on product name or SKU'),
        categoryId: id('category id').optional().describe('Only products in this category (UUID)'),
        isActive: z.boolean().optional().describe('true: only active products; false: only inactive ones'),
        sortBy: z.enum(PRODUCT_SORT_FIELDS).optional().describe('Sort field (default createdAt)'),
        sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort direction (default desc)'),
      }),
      annotations: { ...READ_ONLY, title: 'List products' },
    },
    async (args) =>
      runTool(
        'list_products',
        () => api.request<Product[]>({ method: 'GET', path: '/products', query: args }),
        (items, meta) => ({
          summary: `Found ${meta.total ?? items.length} products (page ${meta.page ?? 1} of ${meta.totalPages ?? 1}).`,
          structured: { items, pagination: paginationOf(meta) },
        }),
      ),
  );

  server.registerTool(
    'get_product',
    {
      title: 'Get a product',
      description:
        'Get one product (SKU, name, description, price as a decimal string, stock, active state) with its categories. ' +
        'Read-only. Permission: any authenticated role (agent included). Unknown id: NOT_FOUND.',
      inputSchema: z.object({ id: id('product id') }),
      annotations: { ...READ_ONLY, title: 'Get a product' },
    },
    async ({ id: productId }) =>
      runTool(
        'get_product',
        () => api.request<Product>({ method: 'GET', path: `/products/${productId}` }),
        (product) => ({
          summary: `Product ${product.sku} "${product.name}", price ${product.price}, ${product.categories.length} categories.`,
          structured: { product },
        }),
      ),
  );

  server.registerTool(
    'list_categories',
    {
      title: 'List categories',
      description:
        'List categories sorted by name, each with its product count, paginated. Optional case-insensitive name search. ' +
        'Read-only. Permission: any authenticated role (agent included).',
      inputSchema: z.object({
        page,
        limit,
        search: z.string().trim().max(100).optional().describe('Case-insensitive match on the category name'),
      }),
      annotations: { ...READ_ONLY, title: 'List categories' },
    },
    async (args) =>
      runTool(
        'list_categories',
        () => api.request<Category[]>({ method: 'GET', path: '/categories', query: args }),
        (items, meta) => ({
          summary: `Found ${meta.total ?? items.length} categories (page ${meta.page ?? 1} of ${meta.totalPages ?? 1}).`,
          structured: { items, pagination: paginationOf(meta) },
        }),
      ),
  );

  server.registerTool(
    'get_category',
    {
      title: 'Get a category with its products',
      description:
        'Get one category with all the products in it (id, SKU, name, price, active state), sorted by product name. ' +
        'Read-only. Permission: any authenticated role (agent included). Unknown id: NOT_FOUND.',
      inputSchema: z.object({ id: id('category id') }),
      annotations: { ...READ_ONLY, title: 'Get a category' },
    },
    async ({ id: categoryId }) =>
      runTool(
        'get_category',
        () => api.request<CategoryDetail>({ method: 'GET', path: `/categories/${categoryId}` }),
        (category) => ({
          summary: `Category "${category.name}" with ${category.productCount} products.`,
          structured: { category },
        }),
      ),
  );
}
