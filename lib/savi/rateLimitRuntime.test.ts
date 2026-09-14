import assert from 'node:assert/strict';
import test from 'node:test';
import { createInMemorySaviRateLimitStore, createSaviRateLimiter } from './rateLimit';

test('missing anonymous OAuth identity uses the bounded shared fallback bucket', async () => {
  const check = createSaviRateLimiter(createInMemorySaviRateLimitStore());
  const decisions = await Promise.all([
    check({ rateLimitClass: 'AUTH' }),
    check({ rateLimitClass: 'AUTH' }),
    check({ rateLimitClass: 'AUTH' }),
    check({ rateLimitClass: 'AUTH' })
  ]);

  assert.deepEqual(decisions.slice(0, 3).map((decision) => decision.allowed), [true, true, true]);
  assert.equal(decisions[3].allowed, false);
});

test('limiter storage failure blocks paid generation and anonymous OAuth', async () => {
  const unavailableStore = {
    async consume() {
      throw new Error('storage unavailable');
    }
  };
  const check = createSaviRateLimiter(unavailableStore);

  const paid = await check({ rateLimitClass: 'PAID_GENERATION', identity: 'user:user-1' });
  assert.deepEqual(paid, { allowed: false, retryAfterSeconds: 5, failure: 'storage' });

  const anonymousAuth = await check({ rateLimitClass: 'AUTH' });
  assert.deepEqual(anonymousAuth, { allowed: false, retryAfterSeconds: 5, failure: 'storage' });
});
