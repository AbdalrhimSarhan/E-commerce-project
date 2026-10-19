import './utils/low-rate-limit';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  type TestContext,
} from './utils/test-app';

/** Uses its own low limit (3), set by ./utils/low-rate-limit before the app loads. */
describe('Rate limiting (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.dataSource);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('answers the 4th login attempt in the window with 429 in the envelope', async () => {
    const attempt = () =>
      request(ctx.http)
        .post('/api/auth/login')
        .send({ email: 'x@test.local', password: 'Wrong12345' });

    for (let i = 0; i < 3; i += 1) {
      await attempt().expect(401);
    }
    const res = await attempt().expect(429);

    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS' },
    });
  });

  it('does not rate limit other routes', async () => {
    for (let i = 0; i < 5; i += 1) {
      await request(ctx.http).get('/api/health').expect(200);
    }
  });
});
