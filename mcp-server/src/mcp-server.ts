import { McpServer } from '@modelcontextprotocol/server';
import type { ApiClient } from './api-client.ts';
import { registerCategoryWriteTools } from './tools/category-write-tools.ts';
import { registerReadTools } from './tools/read-tools.ts';

export const SERVER_INFO = { name: 'product-management', version: '1.0.0' } as const;

const INSTRUCTIONS = [
  'Tools for the Product Management system, acting as the authenticated agent.',
  'You can read products and categories (with their relationships), and create, update and delete categories and manage which products are in them.',
  'You cannot create, change or delete products: the API does not allow it for agents.',
  'Every write is checked and audit-logged by the API. A failed call returns isError with { code, message, details?, requestId }.',
].join(' ');

/**
 * One MCP server instance per HTTP request (stateless), bound to the API
 * client of THAT request's caller. Tools close over `api`, so one caller's
 * key can never be used for another caller's call.
 */
export function createMcpServer(api: ApiClient): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: INSTRUCTIONS,
  });
  registerReadTools(server, api);
  registerCategoryWriteTools(server, api);
  return server;
}
