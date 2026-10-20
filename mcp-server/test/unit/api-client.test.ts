import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiClient } from '../../src/api-client.ts';

const KEY = 'pmk_0a1b2c3d_secretsecretsecretsecretsecretsecretsec';

interface Captured {
  url: string;
  init: RequestInit;
}

function clientWith(respond: (captured: Captured) => Promise<Response>, timeoutMs = 1000) {
  const calls: Captured[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const captured = { url: String(input), init: init ?? {} };
    calls.push(captured);
    return respond(captured);
  };
  const client = new ApiClient({ baseUrl: 'http://api.test/api', apiKey: KEY, timeoutMs, fetch: fakeFetch });
  return { client, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const header = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string>)[name];

describe('ApiClient', () => {
  it('forwards the key as X-API-Key and sends a fresh UUID X-Request-Id', async () => {
    const { client, calls } = clientWith(async ({ init }) =>
      json(200, { success: true, data: [], meta: { requestId: header(init, 'X-Request-Id'), timestamp: 't' } }),
    );

    await client.request({ method: 'GET', path: '/categories' });
    await client.request({ method: 'GET', path: '/categories' });

    const [first, second] = calls;
    assert.ok(first && second);
    assert.equal(header(first.init, 'X-API-Key'), KEY);
    assert.match(header(first.init, 'X-Request-Id') ?? '', /^[0-9a-f-]{36}$/);
    assert.notEqual(header(first.init, 'X-Request-Id'), header(second.init, 'X-Request-Id'));
  });

  it('encodes query parameters and skips undefined ones', async () => {
    const { client, calls } = clientWith(async () =>
      json(200, { success: true, data: [], meta: { requestId: 'r', timestamp: 't' } }),
    );

    await client.request({
      method: 'GET',
      path: '/products',
      query: { search: '50% off', limit: 5, isActive: false, categoryId: undefined },
    });

    const url = new URL(calls[0]?.url ?? '');
    assert.equal(url.pathname, '/api/products');
    assert.equal(url.searchParams.get('search'), '50% off');
    assert.equal(url.searchParams.get('limit'), '5');
    assert.equal(url.searchParams.get('isActive'), 'false');
    assert.equal(url.searchParams.has('categoryId'), false);
  });

  it('sends a JSON body and unwraps the success envelope', async () => {
    const { client, calls } = clientWith(async () =>
      json(201, { success: true, data: { id: 'c1', name: 'X' }, meta: { requestId: 'api-rid', timestamp: 't' } }),
    );

    const result = await client.request<{ id: string }>({ method: 'POST', path: '/categories', body: { name: 'X' } });

    assert.deepEqual(result, {
      ok: true,
      data: { id: 'c1', name: 'X' },
      meta: { requestId: 'api-rid', timestamp: 't' },
      requestId: 'api-rid',
    });
    assert.equal(calls[0]?.init.body, JSON.stringify({ name: 'X' }));
    assert.equal(header(calls[0]?.init ?? {}, 'Content-Type'), 'application/json');
  });

  it('maps an error envelope to a tool error', async () => {
    const { client } = clientWith(async () =>
      json(409, {
        success: false,
        error: { code: 'CONFLICT', message: 'A resource with the same unique value already exists' },
        meta: { requestId: 'api-rid', timestamp: 't', path: '/api/categories' },
      }),
    );

    const result = await client.request({ method: 'POST', path: '/categories', body: { name: 'Dup' } });

    assert.deepEqual(result, {
      ok: false,
      error: { code: 'CONFLICT', message: 'A resource with the same unique value already exists', requestId: 'api-rid' },
    });
  });

  it('maps a timeout to UPSTREAM_UNAVAILABLE', async () => {
    const { client } = clientWith(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
      50,
    );

    const result = await client.request({ method: 'GET', path: '/products' });

    assert.equal(result.ok, false);
    assert.equal(result.ok ? undefined : result.error.code, 'UPSTREAM_UNAVAILABLE');
    assert.match(result.ok ? '' : result.error.message, /did not answer in time/);
  });

  it('maps an unreachable API to UPSTREAM_UNAVAILABLE without internals', async () => {
    const { client } = clientWith(async () => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.5:3000');
    });

    const result = await client.request({ method: 'GET', path: '/products' });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'UPSTREAM_UNAVAILABLE');
      assert.doesNotMatch(JSON.stringify(result.error), /ECONNREFUSED|10\.0\.0\.5|stack/);
    }
  });

  it('treats a 2xx response that is not an envelope as INTERNAL_ERROR', async () => {
    const { client } = clientWith(async () => new Response('<html></html>', { status: 200 }));

    const result = await client.request({ method: 'GET', path: '/products' });

    assert.equal(result.ok ? undefined : result.error.code, 'INTERNAL_ERROR');
  });
});
