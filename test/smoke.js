"use strict";

const assert = require('assert');

// Test 1: Rate limiter allows within limit
const { RateLimiterMemory } = require('../src/rate-limiter');
const limiter = new RateLimiterMemory({ defaultRateLimit: 3, defaultWindowSec: 60 });

assert.strictEqual(limiter.check('key1'), true, 'First request allowed');
assert.strictEqual(limiter.check('key1'), true, 'Second request allowed');
assert.strictEqual(limiter.check('key1'), true, 'Third request allowed');
assert.strictEqual(limiter.check('key1'), false, 'Fourth request blocked');
assert.strictEqual(limiter.remaining('key1'), 0, 'Remaining is 0');

limiter.reset('key1');
assert.strictEqual(limiter.check('key1'), true, 'Reset allows again');

// Test 2: Middleware factory validates options
const { createAnalyticsMiddleware } = require('../src/index');
assert.throws(
  () => createAnalyticsMiddleware({ stripeSecretKey: 'sk_test_123' }),
  /apiKeyHeader/,
  'Missing apiKeyHeader throws'
);
assert.throws(
  () => createAnalyticsMiddleware({ apiKeyHeader: 'x-api-key' }),
  /stripeSecretKey/,
  'Missing stripeSecretKey throws'
);

// Test 3: Usage tracker in-memory
const { UsageTracker } = require('../src/usage-tracker');
const tracker = new UsageTracker(); // no redis = in-memory

(async () => {
  await tracker.recordHit('key-a', '/api/test', 3);
  const usage = await tracker.getUsage('key-a');
  assert.strictEqual(usage.totalHits, 3, 'Total hits recorded');
  assert.strictEqual(usage.endpoints['/api/test'], 3, 'Endpoint count recorded');

  await tracker.resetUsage('key-a');
  const afterReset = await tracker.getUsage('key-a');
  assert.strictEqual(afterReset.totalHits, 0, 'Usage reset');

  console.log('All tests passed.');
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
