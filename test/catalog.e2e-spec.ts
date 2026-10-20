import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  type Actors,
  body,
  createActors,
  createTestApp,
  resetDatabase,
  type TestContext,
} from './utils/test-app';

interface ProductData {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  isActive: boolean;
  categories: Array<{ id: string; name: string }>;
}

interface CategoryData {
  id: string;
  name: string;
  description: string | null;
  productCount: number;
  products?: Array<{ id: string; sku: string }>;
}

interface AuditRow {
  action: string;
  actor_email: string | null;
  actor_type: string;
  auth_method: string | null;
  resource_type: string | null;
  resource_id: string | null;
  changes: Record<string, unknown> | null;
  request_id: string | null;
}

describe('Products and categories (e2e)', () => {
  let ctx: TestContext;
  let actors: Actors;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
    actors = await createActors(ctx);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const admin = () => actors.admin.headers;
  const agent = () => actors.agent.headers;

  async function createCategory(
    name: string,
    headers = admin(),
  ): Promise<CategoryData> {
    const res = await request(ctx.http)
      .post('/api/categories')
      .set(headers)
      .send({ name })
      .expect(201);
    return body<CategoryData>(res).data as CategoryData;
  }

  async function createProduct(
    sku: string,
    extra: Record<string, unknown> = {},
  ): Promise<ProductData> {
    const res = await request(ctx.http)
      .post('/api/products')
      .set(admin())
      .send({ sku, name: `Product ${sku}`, price: '10.00', ...extra })
      .expect(201);
    return body<ProductData>(res).data as ProductData;
  }

  async function auditRows(action?: string): Promise<AuditRow[]> {
    return ctx.dataSource.query<AuditRow[]>(
      `SELECT action, actor_email, actor_type, auth_method, resource_type, resource_id, changes, request_id
         FROM audit_logs WHERE outcome = 'success' ${action ? 'AND action = $1' : ''} ORDER BY occurred_at`,
      action ? [action] : [],
    );
  }

  describe('products', () => {
    it('creates a product in categories, normalizing sku and price', async () => {
      const keyboards = await createCategory('Keyboards');
      const res = await request(ctx.http)
        .post('/api/products')
        .set(admin())
        .send({
          sku: ' kb-001 ',
          name: ' Mechanical keyboard ',
          description: 'RGB',
          price: 129.9,
          stock: 5,
          categoryIds: [keyboards.id],
        })
        .expect(201);

      expect(body<ProductData>(res).data).toMatchObject({
        sku: 'KB-001',
        name: 'Mechanical keyboard',
        price: '129.90',
        stock: 5,
        isActive: true,
        categories: [{ id: keyboards.id, name: 'Keyboards' }],
      });
    });

    it.each([
      ['negative price', { price: '-1' }, 'price'],
      ['3 decimals', { price: '1.999' }, 'price'],
      ['bad sku', { sku: 'no spaces!' }, 'sku'],
      ['negative stock', { stock: -1 }, 'stock'],
      ['unknown field', { color: 'red' }, 'color'],
      ['non-uuid category', { categoryIds: ['x'] }, 'categoryIds'],
      [
        'duplicate category ids',
        { categoryIds: [randomUUID(), 'same', 'same'] },
        'categoryIds',
      ],
    ])('rejects %s with 400', async (_label, override, field) => {
      const res = await request(ctx.http)
        .post('/api/products')
        .set(admin())
        .send({ sku: 'OK-1', name: 'Ok', price: '1.00', ...override })
        .expect(400);

      expect(body(res).error?.code).toBe('VALIDATION_ERROR');
      expect(body(res).error?.details?.map((d) => d.field)).toContain(field);
    });

    it('rejects unknown category ids with 400 and writes nothing (no product, no audit row)', async () => {
      const missing = randomUUID();
      const res = await request(ctx.http)
        .post('/api/products')
        .set(admin())
        .send({ sku: 'KB-1', name: 'K', price: '1', categoryIds: [missing] })
        .expect(400);

      expect(body(res).error?.details).toEqual([
        { field: 'categoryIds', message: `unknown category id(s): ${missing}` },
      ]);
      const [{ count }] = await ctx.dataSource.query<Array<{ count: string }>>(
        'SELECT count(*) FROM products',
      );
      expect(Number(count)).toBe(0);
      expect(await auditRows('product.create')).toHaveLength(0);
    });

    it('rejects a duplicate sku (case-insensitive input) with 409', async () => {
      await createProduct('KB-1');
      const res = await request(ctx.http)
        .post('/api/products')
        .set(admin())
        .send({ sku: 'kb-1', name: 'Other', price: '1' })
        .expect(409);
      expect(body(res).error?.code).toBe('CONFLICT');
    });

    it('lists with pagination, search, category filter and sorting', async () => {
      const mice = await createCategory('Mice');
      await createProduct('KB-1', { name: 'Alpha keyboard', price: '50' });
      await createProduct('MS-1', {
        name: 'Beta mouse',
        price: '20',
        categoryIds: [mice.id],
      });
      await createProduct('MS-2', {
        name: 'Gamma mouse',
        price: '30',
        categoryIds: [mice.id],
        isActive: false,
      });

      const page = await request(ctx.http)
        .get('/api/products?limit=2&sortBy=price&sortOrder=asc')
        .set(admin())
        .expect(200);
      expect(body<ProductData[]>(page).data?.map((p) => p.sku)).toEqual([
        'MS-1',
        'MS-2',
      ]);
      expect(body(page).meta).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });

      const search = await request(ctx.http)
        .get('/api/products?search=MOUSE')
        .set(admin())
        .expect(200);
      expect(body(search).meta.total).toBe(2);

      const inCategory = await request(ctx.http)
        .get(`/api/products?categoryId=${mice.id}&isActive=true`)
        .set(actors.user.headers)
        .expect(200);
      expect(body<ProductData[]>(inCategory).data?.map((p) => p.sku)).toEqual([
        'MS-1',
      ]);
      expect(body<ProductData[]>(inCategory).data?.[0].categories).toEqual([
        { id: mice.id, name: 'Mice' },
      ]);
    });

    it('treats LIKE wildcards in search literally', async () => {
      await createProduct('A-1', { name: '100% cotton' });
      await createProduct('A-2', { name: 'Plain' });

      const res = await request(ctx.http)
        .get('/api/products?search=%25')
        .set(admin())
        .expect(200);
      expect(body(res).meta.total).toBe(1);
    });

    it('updates fields, replaces categories, and audits exactly what changed', async () => {
      const a = await createCategory('A');
      const b = await createCategory('B');
      const product = await createProduct('P-1', { categoryIds: [a.id] });

      const res = await request(ctx.http)
        .patch(`/api/products/${product.id}`)
        .set(admin())
        .send({ price: '12.50', categoryIds: [b.id] })
        .expect(200);
      expect(body<ProductData>(res).data).toMatchObject({
        price: '12.50',
        categories: [{ id: b.id }],
      });

      const [row] = await auditRows('product.update');
      expect(row.changes).toEqual({
        price: { from: '10.00', to: '12.50' },
        categoryIds: { from: [a.id], to: [b.id] },
      });
      expect(row.request_id).toEqual(expect.any(String));
    });

    it('does not audit an update that changes nothing', async () => {
      const product = await createProduct('P-1');
      await request(ctx.http)
        .patch(`/api/products/${product.id}`)
        .set(admin())
        .send({ price: '10' })
        .expect(200);

      expect(await auditRows('product.update')).toHaveLength(0);
    });

    it('deletes a product and its links, but not its categories; returns { id }', async () => {
      const category = await createCategory('C');
      const product = await createProduct('P-1', {
        categoryIds: [category.id],
      });

      const res = await request(ctx.http)
        .delete(`/api/products/${product.id}`)
        .set(admin())
        .expect(200);
      expect(body(res).data).toEqual({ id: product.id });

      await request(ctx.http)
        .get(`/api/products/${product.id}`)
        .set(admin())
        .expect(404);
      const detail = await request(ctx.http)
        .get(`/api/categories/${category.id}`)
        .set(admin())
        .expect(200);
      expect(body<CategoryData>(detail).data).toMatchObject({
        productCount: 0,
        products: [],
      });

      const [row] = await auditRows('product.delete');
      expect(row.changes).toMatchObject({
        before: { sku: 'P-1', categoryIds: [category.id] },
      });
    });

    it('agents can read products but not modify them (403, nothing written)', async () => {
      const product = await createProduct('P-1');
      await request(ctx.http)
        .get(`/api/products/${product.id}`)
        .set(agent())
        .expect(200);
      await request(ctx.http)
        .patch(`/api/products/${product.id}`)
        .set(agent())
        .send({ name: 'x' })
        .expect(403);
      await request(ctx.http)
        .delete(`/api/products/${product.id}`)
        .set(agent())
        .expect(403);

      const unchanged = await request(ctx.http)
        .get(`/api/products/${product.id}`)
        .set(admin())
        .expect(200);
      expect(body<ProductData>(unchanged).data?.name).toBe('Product P-1');
    });
  });

  describe('categories', () => {
    it('rejects a name that differs only in case with 409', async () => {
      await createCategory('Keyboards');
      const res = await request(ctx.http)
        .post('/api/categories')
        .set(admin())
        .send({ name: 'KEYBOARDS' })
        .expect(409);
      expect(body(res).error?.code).toBe('CONFLICT');
    });

    it('lists with product counts', async () => {
      const a = await createCategory('A');
      await createCategory('B');
      await createProduct('P-1', { categoryIds: [a.id] });
      await createProduct('P-2', { categoryIds: [a.id] });

      const res = await request(ctx.http)
        .get('/api/categories')
        .set(actors.user.headers)
        .expect(200);
      expect(
        body<CategoryData[]>(res).data?.map((c) => [c.name, c.productCount]),
      ).toEqual([
        ['A', 2],
        ['B', 0],
      ]);
    });

    it('an agent creates, renames and deletes a category; every step is audited as the agent', async () => {
      const created = await createCategory('Draft', agent());
      await request(ctx.http)
        .patch(`/api/categories/${created.id}`)
        .set(agent())
        .send({ name: 'Final', description: 'Done' })
        .expect(200);
      await request(ctx.http)
        .delete(`/api/categories/${created.id}`)
        .set(agent())
        .expect(200);

      const rows = await auditRows();
      const categoryRows = rows.filter((r) => r.resource_type === 'category');
      expect(categoryRows.map((r) => r.action)).toEqual([
        'category.create',
        'category.update',
        'category.delete',
      ]);
      for (const row of categoryRows) {
        expect(row).toMatchObject({
          actor_type: 'agent',
          auth_method: 'api_key',
          actor_email: actors.agent.user.email,
          resource_id: created.id,
        });
      }
      expect(categoryRows[1].changes).toEqual({
        name: { from: 'Draft', to: 'Final' },
        description: { from: null, to: 'Done' },
      });
    });

    it('deleting a category keeps its products', async () => {
      const category = await createCategory('C');
      const product = await createProduct('P-1', {
        categoryIds: [category.id],
      });

      await request(ctx.http)
        .delete(`/api/categories/${category.id}`)
        .set(admin())
        .expect(200);

      const res = await request(ctx.http)
        .get(`/api/products/${product.id}`)
        .set(admin())
        .expect(200);
      expect(body<ProductData>(res).data?.categories).toEqual([]);
    });

    describe('product links (agent)', () => {
      it('adds products idempotently and audits only the new links', async () => {
        const category = await createCategory('C');
        const p1 = await createProduct('P-1');
        const p2 = await createProduct('P-2');

        await request(ctx.http)
          .post(`/api/categories/${category.id}/products`)
          .set(agent())
          .send({ productIds: [p1.id] })
          .expect(201);
        const res = await request(ctx.http)
          .post(`/api/categories/${category.id}/products`)
          .set(agent())
          .send({ productIds: [p1.id, p2.id] })
          .expect(201);

        expect(
          body<CategoryData>(res).data?.products?.map((p) => p.sku),
        ).toEqual(['P-1', 'P-2']);
        const rows = await auditRows('category.products.add');
        expect(rows.map((r) => r.changes)).toEqual([
          { added: [p1.id] },
          { added: [p2.id] },
        ]);
      });

      it('replaces the set exactly and audits added and removed ids', async () => {
        const category = await createCategory('C');
        const [p1, p2, p3] = await Promise.all([
          createProduct('P-1'),
          createProduct('P-2'),
          createProduct('P-3'),
        ]);
        await request(ctx.http)
          .post(`/api/categories/${category.id}/products`)
          .set(agent())
          .send({ productIds: [p1.id, p2.id] })
          .expect(201);

        const res = await request(ctx.http)
          .put(`/api/categories/${category.id}/products`)
          .set(agent())
          .send({ productIds: [p2.id, p3.id] })
          .expect(200);

        expect(
          body<CategoryData>(res).data?.products?.map((p) => p.sku),
        ).toEqual(['P-2', 'P-3']);
        const [row] = await auditRows('category.products.replace');
        expect(row.changes).toEqual({ added: [p3.id], removed: [p1.id] });
      });

      it('removes one product; removing it again is 404', async () => {
        const category = await createCategory('C');
        const product = await createProduct('P-1', {
          categoryIds: [category.id],
        });

        await request(ctx.http)
          .delete(`/api/categories/${category.id}/products/${product.id}`)
          .set(agent())
          .expect(200);
        await request(ctx.http)
          .delete(`/api/categories/${category.id}/products/${product.id}`)
          .set(agent())
          .expect(404);
        expect(await auditRows('category.products.remove')).toHaveLength(1);
      });

      it('rejects unknown products with 400 and an unknown category with 404, writing nothing', async () => {
        const category = await createCategory('C');
        const product = await createProduct('P-1');
        const missing = randomUUID();

        const res = await request(ctx.http)
          .post(`/api/categories/${category.id}/products`)
          .set(agent())
          .send({ productIds: [product.id, missing] })
          .expect(400);
        expect(body(res).error?.details?.[0]).toEqual({
          field: 'productIds',
          message: `unknown product id(s): ${missing}`,
        });

        await request(ctx.http)
          .post(`/api/categories/${randomUUID()}/products`)
          .set(agent())
          .send({ productIds: [product.id] })
          .expect(404);

        const detail = await request(ctx.http)
          .get(`/api/categories/${category.id}`)
          .set(admin())
          .expect(200);
        expect(body<CategoryData>(detail).data?.productCount).toBe(0);
        expect(await auditRows('category.products.add')).toHaveLength(0);
      });

      it('handles concurrent replaces of the same category consistently', async () => {
        const category = await createCategory('C');
        const products = await Promise.all(
          ['A', 'B', 'C', 'D'].map((s) => createProduct(`P-${s}`)),
        );
        const [a, b, c, d] = products.map((p) => p.id);

        const results = await Promise.all([
          request(ctx.http)
            .put(`/api/categories/${category.id}/products`)
            .set(agent())
            .send({ productIds: [a, b] }),
          request(ctx.http)
            .put(`/api/categories/${category.id}/products`)
            .set(agent())
            .send({ productIds: [c, d] }),
        ]);
        expect(results.map((r) => r.status)).toEqual([200, 200]);

        const detail = await request(ctx.http)
          .get(`/api/categories/${category.id}`)
          .set(admin())
          .expect(200);
        const final = (body<CategoryData>(detail).data?.products ?? [])
          .map((p) => p.id)
          .sort();
        expect([[a, b].sort(), [c, d].sort()]).toContainEqual(final);
      });
    });
  });

  it('exposes the audit trail of admin changes to super_admin only, with filters', async () => {
    const product = await createProduct('P-1');
    await request(ctx.http)
      .patch(`/api/products/${product.id}`)
      .set(admin())
      .send({ stock: 3 })
      .expect(200);

    // Separation of duties: the admin who made the change cannot read its trail.
    await request(ctx.http)
      .get(`/api/audit-logs?resourceId=${product.id}`)
      .set(admin())
      .expect(403);

    const res = await request(ctx.http)
      .get(`/api/audit-logs?resourceType=product&resourceId=${product.id}`)
      .set(actors.superAdmin.headers)
      .expect(200);

    const actions = (body<Array<{ action: string }>>(res).data ?? []).map(
      (r) => r.action,
    );
    expect(actions).toEqual(['product.update', 'product.create']); // newest first
    expect(body(res).meta.total).toBe(2);
  });

  it('rejects writes to the audit log at the database level', async () => {
    await createProduct('P-1');
    await expect(
      ctx.dataSource.query(`UPDATE audit_logs SET action = 'tampered'`),
    ).rejects.toThrow(/append-only/);
    await expect(
      ctx.dataSource.query('DELETE FROM audit_logs'),
    ).rejects.toThrow(/append-only/);
  });
});
