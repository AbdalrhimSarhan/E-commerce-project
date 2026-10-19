import request from 'supertest';
import {
  body,
  createTestApp,
  resetDatabase,
  type TestContext,
} from './utils/test-app';

describe('HTTP conventions (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('wraps success responses in the envelope with a request id', async () => {
    const res = await request(ctx.http).get('/api/health').expect(200);

    expect(body(res)).toMatchObject({
      success: true,
      data: { status: 'ok' },
      meta: {
        requestId: expect.any(String) as string,
        timestamp: expect.any(String) as string,
      },
    });
    expect(res.headers['x-request-id']).toBe(body(res).meta.requestId);
  });

  it('echoes a valid client X-Request-Id in the header and in meta', async () => {
    const res = await request(ctx.http)
      .get('/api/health')
      .set('X-Request-Id', 'client-req-42')
      .expect(200);

    expect(res.headers['x-request-id']).toBe('client-req-42');
    expect(body(res).meta.requestId).toBe('client-req-42');
  });

  it('replaces an invalid X-Request-Id with a generated one', async () => {
    const res = await request(ctx.http)
      .get('/api/health')
      .set('X-Request-Id', 'bad id!')
      .expect(200);

    expect(body(res).meta.requestId).not.toBe('bad id!');
    expect(body(res).meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['an unknown /api route', '/api/does-not-exist'],
    ['a route outside /api', '/foo'],
  ])('answers %s with the 404 error envelope', async (_label, path) => {
    const res = await request(ctx.http)
      .get(path)
      .set('X-Request-Id', 'nf-1')
      .expect(404);

    expect(body(res)).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: `Cannot GET ${path}` },
      meta: {
        requestId: 'nf-1',
        timestamp: expect.any(String) as string,
        path,
      },
    });
  });

  it('answers malformed JSON with 400 VALIDATION_ERROR', async () => {
    const res = await request(ctx.http)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
    expect(body(res).error?.code).toBe('VALIDATION_ERROR');
  });

  it('answers errors thrown in the authentication middleware with the envelope', async () => {
    const res = await request(ctx.http)
      .get('/api/products')
      .set('X-API-Key', 'garbage')
      .set('X-Request-Id', 'mw-1')
      .expect(401);
    expect(body(res)).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
      meta: { requestId: 'mw-1' },
    });
  });

  it('sets security headers (helmet)', async () => {
    const res = await request(ctx.http).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the OpenAPI document with both security schemes', async () => {
    const res = await request(ctx.http).get('/api/docs-json').expect(200);
    const doc = res.body as {
      components: { securitySchemes: Record<string, unknown> };
      paths: Record<string, unknown>;
    };

    expect(Object.keys(doc.components.securitySchemes).sort()).toEqual([
      'apiKey',
      'bearer',
    ]);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/products',
        '/api/categories/{id}/products',
        '/api/auth/login',
        '/api/users',
      ]),
    );
  });
});
