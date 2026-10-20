import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Client } from '@modelcontextprotocol/client';
import {
  AGENT_KEY,
  api,
  call,
  connect,
  errorOf,
  loginAdmin,
  loginSuperAdmin,
  MCP_URL,
  unique,
} from './helpers.ts';

interface Product {
  id: string;
  sku: string;
  name: string;
}

interface CategoryDetail {
  id: string;
  name: string;
  description: string | null;
  productCount: number;
  products: Array<{ id: string; sku: string }>;
}

interface AuditRow {
  action: string;
  actorType: string;
  authMethod: string | null;
  actorEmail: string | null;
  requestId: string | null;
  resourceId: string | null;
}

const EXPECTED_TOOLS = [
  'add_products_to_category',
  'create_category',
  'delete_category',
  'get_category',
  'get_product',
  'list_categories',
  'list_products',
  'remove_product_from_category',
  'replace_category_products',
  'update_category',
];

describe('MCP server (e2e, real API + DB)', () => {
  let agent: Client;
  let adminToken: string;
  const run = unique();
  const products: Product[] = [];
  const categoryIds: string[] = [];

  before(async () => {
    agent = await connect({ 'X-API-Key': AGENT_KEY });
    adminToken = await loginAdmin();

    // The agent may not create products, so an admin prepares two through the API.
    for (const letter of ['A', 'B']) {
      const { status, data } = await api<Product>('/products', {
        method: 'POST',
        token: adminToken,
        body: { sku: `MCP-${run}-${letter}`, name: `MCP e2e ${letter} ${run}`, price: '9.99' },
      });
      assert.equal(status, 201);
      products.push(data);
    }
  });

  after(async () => {
    for (const id of categoryIds) {
      await api(`/categories/${id}`, { method: 'DELETE', token: adminToken });
    }
    for (const product of products) {
      await api(`/products/${product.id}`, { method: 'DELETE', token: adminToken });
    }
    await agent.close();
  });

  const [productA, productB] = [() => products[0] as Product, () => products[1] as Product];

  async function categoryViaTool(id: string): Promise<CategoryDetail> {
    const outcome = await call(agent, 'get_category', { id });
    assert.equal(outcome.isError, false, outcome.text);
    return outcome.structured.category as CategoryDetail;
  }

  // 1 ------------------------------------------------------------------------
  describe('tools/list', () => {
    for (const era of ['legacy', 'modern'] as const) {
      it(`returns exactly the 10 tools, no product write tools (${era} era)`, async () => {
        const client = era === 'legacy' ? agent : await connect({ 'X-API-Key': AGENT_KEY }, 'modern');
        try {
          assert.equal(client.getProtocolEra(), era);
          const { tools } = await client.listTools();

          assert.deepEqual(tools.map((tool) => tool.name).sort(), EXPECTED_TOOLS);
          assert.equal(tools.some((tool) => /^(create|update|delete)_product/.test(tool.name)), false);

          const byName = new Map(tools.map((tool) => [tool.name, tool]));
          for (const read of ['list_products', 'get_product', 'list_categories', 'get_category']) {
            assert.equal(byName.get(read)?.annotations?.readOnlyHint, true, read);
          }
          for (const destructive of ['delete_category', 'replace_category_products', 'remove_product_from_category']) {
            assert.equal(byName.get(destructive)?.annotations?.destructiveHint, true, destructive);
          }
          assert.equal(byName.get('add_products_to_category')?.annotations?.idempotentHint, true);
          for (const tool of tools) {
            assert.ok(tool.description && tool.description.length > 40, `${tool.name} has a description`);
            assert.equal(tool.inputSchema.type, 'object');
          }
        } finally {
          if (client !== agent) await client.close();
        }
      });
    }
  });

  // 2 ------------------------------------------------------------------------
  describe('read tools', () => {
    it('list_products finds the products, with pagination', async () => {
      const outcome = await call(agent, 'list_products', { search: `MCP-${run}`, sortBy: 'sku', sortOrder: 'asc' });

      assert.equal(outcome.isError, false, outcome.text);
      const items = outcome.structured.items as Product[];
      assert.deepEqual(items.map((p) => p.sku), [`MCP-${run}-A`, `MCP-${run}-B`]);
      assert.deepEqual(outcome.structured.pagination, { page: 1, limit: 20, total: 2, totalPages: 1 });
      assert.match(outcome.text, /Found 2 products/);
    });

    it('get_product returns the same data as the API', async () => {
      const outcome = await call(agent, 'get_product', { id: productA().id });
      const direct = await api<Product>(`/products/${productA().id}`, { token: adminToken });

      assert.equal(outcome.isError, false, outcome.text);
      assert.deepEqual(outcome.structured.product, direct.data);
    });

    it('list_categories and get_category return the category with its products', async () => {
      const created = await api<CategoryDetail>('/categories', {
        method: 'POST',
        token: adminToken,
        body: { name: `MCP read ${run}`, productIds: [productA().id] },
      });
      categoryIds.push(created.data.id);

      const listed = await call(agent, 'list_categories', { search: `MCP read ${run}` });
      assert.equal(listed.isError, false, listed.text);
      assert.deepEqual(
        (listed.structured.items as CategoryDetail[]).map((c) => [c.name, c.productCount]),
        [[`MCP read ${run}`, 1]],
      );

      const detail = await categoryViaTool(created.data.id);
      assert.deepEqual(detail.products.map((p) => p.id), [productA().id]);
    });
  });

  // 3 + 4 --------------------------------------------------------------------
  it('full flow: create -> update -> add -> replace -> remove -> delete, verified via read tools', async () => {
    // create
    const created = await call(agent, 'create_category', { name: `MCP flow ${run}`, description: 'by the agent' });
    assert.equal(created.isError, false, created.text);
    const category = created.structured.category as CategoryDetail;
    const createRequestId = created.structured.requestId as string;
    categoryIds.push(category.id);
    assert.equal((await categoryViaTool(category.id)).description, 'by the agent');

    // update
    const updated = await call(agent, 'update_category', { id: category.id, name: `MCP flow renamed ${run}` });
    assert.equal(updated.isError, false, updated.text);
    assert.equal((await categoryViaTool(category.id)).name, `MCP flow renamed ${run}`);

    // add
    const added = await call(agent, 'add_products_to_category', {
      categoryId: category.id,
      productIds: [productA().id],
    });
    assert.equal(added.isError, false, added.text);
    assert.deepEqual((await categoryViaTool(category.id)).products.map((p) => p.id), [productA().id]);

    // replace
    const replaced = await call(agent, 'replace_category_products', {
      categoryId: category.id,
      productIds: [productB().id],
    });
    assert.equal(replaced.isError, false, replaced.text);
    assert.deepEqual((await categoryViaTool(category.id)).products.map((p) => p.id), [productB().id]);

    // remove
    const removed = await call(agent, 'remove_product_from_category', {
      categoryId: category.id,
      productId: productB().id,
    });
    assert.equal(removed.isError, false, removed.text);
    assert.equal((await categoryViaTool(category.id)).productCount, 0);

    // delete
    const deleted = await call(agent, 'delete_category', { id: category.id });
    assert.equal(deleted.isError, false, deleted.text);
    assert.deepEqual(deleted.structured.deleted, { id: category.id });
    const gone = await call(agent, 'get_category', { id: category.id });
    assert.equal(gone.isError, true);
    assert.equal(errorOf(gone).code, 'NOT_FOUND');
    // Products are never deleted by category operations.
    assert.equal((await call(agent, 'get_product', { id: productB().id })).isError, false);

    // 4: the audit row was written by the API, as the agent, with OUR request id.
    const audit = await api<AuditRow[]>(`/audit-logs?resourceId=${category.id}&action=category.create`, {
      token: adminToken,
    });
    assert.equal(audit.status, 200);
    const [row] = audit.data;
    assert.ok(row, 'audit row exists');
    assert.equal(row.actorType, 'agent');
    assert.equal(row.authMethod, 'api_key');
    assert.equal(row.requestId, createRequestId);

    const history = await api<AuditRow[]>(`/audit-logs?resourceId=${category.id}&limit=20`, { token: adminToken });
    assert.deepEqual(
      history.data.map((r) => r.action).reverse(),
      [
        'category.create',
        'category.update',
        'category.products.add',
        'category.products.replace',
        'category.products.remove',
        'category.delete',
      ],
    );
    assert.ok(history.data.every((r) => r.actorType === 'agent'));
  });

  // 5 ------------------------------------------------------------------------
  describe('API errors come back as tool errors with the API code', () => {
    it('duplicate category name (case-insensitive) -> CONFLICT', async () => {
      const first = await call(agent, 'create_category', { name: `MCP dup ${run}` });
      categoryIds.push((first.structured.category as CategoryDetail).id);

      const second = await call(agent, 'create_category', { name: `mcp DUP ${run}` });

      assert.equal(second.isError, true);
      assert.equal(errorOf(second).code, 'CONFLICT');
      assert.match(errorOf(second).requestId, /^[0-9a-f-]{36}$/);
      assert.match(second.text, /^CONFLICT: /);
    });

    it('unknown product id -> VALIDATION_ERROR with the exact id in details', async () => {
      const target = await call(agent, 'create_category', { name: `MCP val ${run}` });
      const categoryId = (target.structured.category as CategoryDetail).id;
      categoryIds.push(categoryId);
      const missing = '00000000-0000-4000-8000-000000000000';

      const outcome = await call(agent, 'add_products_to_category', { categoryId, productIds: [missing] });

      assert.equal(outcome.isError, true);
      assert.equal(errorOf(outcome).code, 'VALIDATION_ERROR');
      assert.deepEqual(errorOf(outcome).details, [
        { field: 'productIds', message: `unknown product id(s): ${missing}` },
      ]);
    });

    it('unknown category -> NOT_FOUND', async () => {
      const outcome = await call(agent, 'update_category', {
        id: '00000000-0000-4000-8000-000000000000',
        name: 'x',
      });
      assert.equal(errorOf(outcome).code, 'NOT_FOUND');
    });

    it('input that breaks the tool schema is rejected before reaching the API', async () => {
      const outcome = await call(agent, 'get_product', { id: 'not-a-uuid' });
      assert.equal(outcome.isError, true);
    });
  });

  // 6 ------------------------------------------------------------------------
  describe('authentication', () => {
    it('missing key -> HTTP 401 before any MCP handling', async () => {
      const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } },
        }),
      });
      assert.equal(response.status, 401);
    });

    it('the key also works as Authorization: Bearer', async () => {
      const client = await connect({ Authorization: `Bearer ${AGENT_KEY}` });
      try {
        assert.equal((await call(client, 'list_categories', { limit: 1 })).isError, false);
      } finally {
        await client.close();
      }
    });

    it('garbage key -> tool error UNAUTHORIZED (rejected by the API)', async () => {
      const client = await connect({ 'X-API-Key': 'pmk_garbage' });
      try {
        const outcome = await call(client, 'list_categories', {});
        assert.equal(outcome.isError, true);
        assert.equal(errorOf(outcome).code, 'UNAUTHORIZED');
      } finally {
        await client.close();
      }
    });
  });

  // 7 ------------------------------------------------------------------------
  it('deactivated agent -> UNAUTHORIZED; works again after reactivation', async () => {
    const superAdminToken = await loginSuperAdmin();
    const me = await fetch(`${process.env.API_URL ?? 'http://localhost:3000/api'}/auth/me`, {
      headers: { 'X-API-Key': AGENT_KEY },
    });
    const agentId = ((await me.json()) as { data: { id: string } }).data.id;

    const deactivated = await api(`/users/${agentId}/deactivate`, { method: 'PATCH', token: superAdminToken });
    assert.equal(deactivated.status, 200);
    try {
      const outcome = await call(agent, 'list_products', {});
      assert.equal(outcome.isError, true);
      assert.equal(errorOf(outcome).code, 'UNAUTHORIZED');
    } finally {
      const reactivated = await api(`/users/${agentId}/activate`, { method: 'PATCH', token: superAdminToken });
      assert.equal(reactivated.status, 200);
    }

    assert.equal((await call(agent, 'list_products', { limit: 1 })).isError, false);
  });
});
