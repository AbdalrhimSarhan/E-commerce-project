import request from 'supertest';
import { Category } from '../src/modules/categories/entities/category.entity';
import { ProductCategory } from '../src/modules/categories/entities/product-category.entity';
import { Product } from '../src/modules/products/entities/product.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  seedDemoCatalog,
} from '../src/database/seeds/demo-catalog';
import {
  body,
  createTestApp,
  createUser,
  login,
  resetDatabase,
  type TestContext,
} from './utils/test-app';

interface ApiProduct {
  sku: string;
  categories: Array<{ name: string }>;
}

describe('Demo catalog seed (e2e, real DB)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.dataSource);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const runSeed = (enabled = true) =>
    ctx.dataSource.transaction((manager) => seedDemoCatalog(manager, enabled));

  it('creates the catalog on an empty products table', async () => {
    const outcome = await runSeed();

    const expectedLinks = DEMO_PRODUCTS.reduce(
      (sum, p) => sum + p.categories.length,
      0,
    );
    expect(outcome).toEqual({
      status: 'created',
      products: 20,
      categories: 8,
      links: expectedLinks,
      reusedCategories: [],
    });
    expect(await ctx.dataSource.getRepository(Product).count()).toBe(20);
    expect(await ctx.dataSource.getRepository(Category).count()).toBe(8);
    expect(await ctx.dataSource.getRepository(ProductCategory).count()).toBe(
      expectedLinks,
    );
  });

  it('stores the fixed demo ids, so get-by-id works with them through the API', async () => {
    await runSeed();
    const admin = await createUser(ctx.dataSource, UserRole.Admin);
    const auth = {
      Authorization: `Bearer ${(await login(ctx.http, admin.email)).accessToken}`,
    };

    const product = await request(ctx.http)
      .get('/api/products/10000000-0000-4000-8000-000000000001')
      .set(auth)
      .expect(200);
    expect(body<ApiProduct>(product).data?.sku).toBe('LAP-14-PRO');

    const category = await request(ctx.http)
      .get('/api/categories/20000000-0000-4000-8000-000000000006')
      .set(auth)
      .expect(200);
    expect(
      body<{ name: string; productCount: number }>(category).data,
    ).toMatchObject({
      name: 'Home Office',
      productCount: 8,
    });

    const stored = await ctx.dataSource
      .getRepository(Product)
      .find({ select: { id: true } });
    expect(stored.map((p) => p.id).sort()).toEqual(
      DEMO_PRODUCTS.map((p) => p.id).sort(),
    );
  });

  it('creates the links exactly as specified, visible through the API', async () => {
    await runSeed();
    const admin = await createUser(ctx.dataSource, UserRole.Admin);
    const { accessToken } = await login(ctx.http, admin.email);

    const res = await request(ctx.http)
      .get('/api/products?limit=100')
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
    const bySku = new Map(
      (body<ApiProduct[]>(res).data ?? []).map((p) => [
        p.sku,
        p.categories.map((c) => c.name).sort(),
      ]),
    );

    for (const demo of DEMO_PRODUCTS) {
      expect([demo.sku, bySku.get(demo.sku)]).toEqual([
        demo.sku,
        [...demo.categories].sort(),
      ]);
    }

    const categories = await request(ctx.http)
      .get('/api/categories?limit=100')
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
    const counts = new Map(
      (
        body<Array<{ name: string; productCount: number }>>(categories).data ??
        []
      ).map((c) => [c.name, c.productCount]),
    );
    expect(counts.get('Clearance')).toBe(0);
    expect([...counts.keys()].sort()).toEqual(
      DEMO_CATEGORIES.map((c) => c.name).sort(),
    );
  });

  it('is skipped when products already exist, and changes nothing', async () => {
    await ctx.dataSource
      .getRepository(Product)
      .save({ sku: 'MANUAL-1', name: 'Manual', price: '1.00' });

    expect(await runSeed()).toEqual({
      status: 'skipped',
      reason: 'products_exist',
    });
    expect(await ctx.dataSource.getRepository(Product).count()).toBe(1);
    expect(await ctx.dataSource.getRepository(Category).count()).toBe(0);
  });

  it('is idempotent: a second run creates nothing', async () => {
    await runSeed();

    expect(await runSeed()).toEqual({
      status: 'skipped',
      reason: 'products_exist',
    });
    expect(await ctx.dataSource.getRepository(Product).count()).toBe(20);
  });

  it('is skipped when SEED_ON_STARTUP is not true', async () => {
    expect(await runSeed(false)).toEqual({
      status: 'skipped',
      reason: 'disabled',
    });
    expect(await ctx.dataSource.getRepository(Product).count()).toBe(0);
  });

  it('reuses an existing category with the same name (case-insensitive) instead of failing', async () => {
    await ctx.dataSource
      .getRepository(Category)
      .save({ name: 'AUDIO', description: 'mine' });

    const outcome = await runSeed();

    expect(outcome).toMatchObject({
      status: 'created',
      categories: 7,
      reusedCategories: ['AUDIO'],
    });
    expect(await ctx.dataSource.getRepository(Category).count()).toBe(8);
  });

  it('writes no audit rows (initial data, not a user or agent action)', async () => {
    await runSeed();

    const [{ count }] = await ctx.dataSource.query<Array<{ count: string }>>(
      'SELECT count(*) FROM audit_logs',
    );
    expect(Number(count)).toBe(0);
  });
});
