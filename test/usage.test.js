"use strict";

const assert = require("node:assert").strict;
const { EventEmitter } = require("node:events");
const { createAnalyticsMiddleware } = require("../src/index");
const { RateLimiterMemory } = require("../src/rate-limiter");
const { UsageTracker } = require("../src/usage-tracker");

// --- In-memory rate limiter store (matches RateLimiterMemory._store) ---

// --- Minimal Express-like request/response ---

function makeReq(overrides = {}) {
  const req = new EventEmitter();
  req.ip = "127.0.0.1";
  req.path = "/";
  req.url = "/";
  req.headers = { "x-api-key": "test-key" };
  Object.assign(req, overrides);
  return req;
}

function makeRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res._headers = {};
  res._body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res._body = JSON.stringify(body);
    return res;
  };
  res.send = (body) => {
    res._body = body;
    return res;
  };
  res.setHeader = (k, v) => {
    res._headers[k] = v;
    return res;
  };
  return res;
}

// ============================================================
// RATE LIMITER — direct class tests (no middleware)
// ============================================================

function testRateLimiterCheck() {
  console.log("  RateLimiterMemory.check…");
  const limiter = new RateLimiterMemory({
    defaultRateLimit: 3,
    defaultWindowSec: 1,
  });

  // First 3 calls pass
  assert.strictEqual(limiter.check("k1"), true, "1st check passes");
  assert.strictEqual(limiter.check("k1"), true, "2nd check passes");
  assert.strictEqual(limiter.check("k1"), true, "3rd check passes");

  // 4th should fail
  assert.strictEqual(limiter.check("k1"), false, "4th check blocked");
  assert.strictEqual(limiter.check("k1"), false, "5th still blocked");

  // Different key has its own bucket
  assert.strictEqual(limiter.check("k2"), true, "different key passes");

  console.log("    ✓ check OK");
}

function testRateLimiterWindowReset() {
  console.log("  RateLimiterMemory window reset…");
  const limiter = new RateLimiterMemory({
    defaultRateLimit: 1,
    defaultWindowSec: 1,
  });

  assert.strictEqual(limiter.check("reset-k"), true);
  assert.strictEqual(limiter.check("reset-k"), false);

  console.log("    waiting 1100ms for window reset…");
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        assert.strictEqual(limiter.check("reset-k"), true, "window reset allows request");
        console.log("    ✓ window reset OK");
        resolve();
      } catch (err) {
        reject(err);
      }
    }, 1100);
  });
}

function testRateLimiterRemaining() {
  console.log("  RateLimiterMemory.remaining…");
  const limiter = new RateLimiterMemory({
    defaultRateLimit: 5,
    defaultWindowSec: 60,
  });

  assert.strictEqual(limiter.remaining("key-a"), 5, "before any requests");
  limiter.check("key-a");
  assert.strictEqual(limiter.remaining("key-a"), 4, "after 1 request");
  limiter.check("key-a");
  limiter.check("key-a");
  assert.strictEqual(limiter.remaining("key-a"), 2, "after 3 requests");

  console.log("    ✓ remaining OK");
}

function testRateLimiterReset() {
  console.log("  RateLimiterMemory.reset…");
  const limiter = new RateLimiterMemory({
    defaultRateLimit: 1,
    defaultWindowSec: 60,
  });

  limiter.check("reset-me");
  assert.strictEqual(limiter.check("reset-me"), false, "blocked after limit");
  limiter.reset("reset-me");
  assert.strictEqual(limiter.check("reset-me"), true, "passes after reset");

  console.log("    ✓ reset OK");
}

// ============================================================
// USAGE TRACKER — direct class tests (no Redis)
// ============================================================

function testUsageTrackerRecordHit() {
  console.log("  UsageTracker.recordHit…");
  const tracker = new UsageTracker(null); // in-memory mode

  return tracker.recordHit("api-key-1", "/api/data", 1).then(() =>
    tracker.recordHit("api-key-1", "/api/data", 1).then(() =>
      tracker.recordHit("api-key-1", "/api/other", 2).then(() =>
        tracker.getUsage("api-key-1").then((usage) => {
          assert.strictEqual(usage.totalHits, 4, "total hits = 1+1+2");
          assert.strictEqual(usage.endpoints["/api/data"], 2, "/api/data count");
          assert.strictEqual(usage.endpoints["/api/other"], 2, "/api/other count");
          console.log("    ✓ recordHit OK");
        })
      )
    )
  );
}

function testUsageTrackerGetUsageEmpty() {
  console.log("  UsageTracker.getUsage (no hits)…");
  const tracker = new UsageTracker(null);
  return tracker
    .getUsage("never-seen")
    .then((usage) => {
      assert.strictEqual(usage.totalHits, 0, "zero hits for unknown key");
      assert.deepStrictEqual(usage.endpoints, {}, "empty endpoints");
      console.log("    ✓ empty usage OK");
    });
}

function testUsageTrackerMultiKey() {
  console.log("  UsageTracker multi-key…");
  const tracker = new UsageTracker(null);

  return tracker
    .recordHit("key-a", "/a", 1)
    .then(() => tracker.recordHit("key-b", "/b", 1))
    .then(() => tracker.recordHit("key-a", "/a", 1))
    .then(() => tracker.getAllUsage().then((all) => {
      assert.strictEqual(all["key-a"], 2, "key-a total");
      assert.strictEqual(all["key-b"], 1, "key-b total");
      console.log("    ✓ multi-key OK");
    }));
}

function testUsageTrackerReset() {
  console.log("  UsageTracker.resetUsage…");
  const tracker = new UsageTracker(null);

  return (
    tracker
      .recordHit("to-reset", "/ep", 5)
      .then(() => tracker.getUsage("to-reset"))
      .then((u) => assert.strictEqual(u.totalHits, 5, "before reset"))
      .then(() => tracker.resetUsage("to-reset"))
      .then(() => tracker.getUsage("to-reset"))
      .then((u) => {
        assert.strictEqual(u.totalHits, 0, "zero after reset");
        console.log("    ✓ resetUsage OK");
      })
  );
}

// ============================================================
// INTEGRATION: full middleware stack
// ============================================================

function testMiddlewareRequiresApiKey() {
  console.log("  middleware missing API key…");
  const analytics = createAnalyticsMiddleware({
    stripeSecretKey: "sk_test_fake",
    apiKeyHeader: "x-api-key",
    defaultRateLimit: 100,
  });

  return (async () => {
    const req = makeReq({ headers: {} }); // no API key header
    const res = makeRes();
    await new Promise((resolve) => analytics.middleware(req, res, resolve));

    assert.strictEqual(res.statusCode, 401, "missing key returns 401");
    assert.ok(
      res._body.includes("MISSING_API_KEY"),
      "body contains MISSING_API_KEY code"
    );
    console.log("    ✓ missing api key OK");
  })();
}

function testMiddlewareEnforcesRateLimit() {
  console.log("  middleware rate limit enforcement…");
  const analytics = createAnalyticsMiddleware({
    stripeSecretKey: "sk_test_fake",
    apiKeyHeader: "x-api-key",
    defaultRateLimit: 2,
    defaultWindowSec: 60,
  });

  return (async () => {
    // First 2 pass
    const r1 = makeRes();
    await new Promise((resolve) => analytics.middleware(makeReq(), r1, resolve));
    assert.strictEqual(r1.statusCode, 200, "1st request passes");

    const r2 = makeRes();
    await new Promise((resolve) => analytics.middleware(makeReq(), r2, resolve));
    assert.strictEqual(r2.statusCode, 200, "2nd request passes");

    // 3rd blocked
    const r3 = makeRes();
    await new Promise((resolve) => analytics.middleware(makeReq(), r3, resolve));
    assert.strictEqual(r3.statusCode, 429, "3rd request rate limited");
    assert.ok(
      r3._body.includes("RATE_LIMIT_EXCEEDED"),
      "body contains RATE_LIMIT_EXCEEDED"
    );

    console.log("    ✓ rate limit enforcement OK");
  })();
}

function testMiddlewareUsageHeaders() {
  console.log("  middleware usage headers…");
  const analytics = createAnalyticsMiddleware({
    stripeSecretKey: "sk_test_fake",
    apiKeyHeader: "x-api-key",
    defaultRateLimit: 100,
  });

  return (async () => {
    const r1 = makeRes();
    await new Promise((resolve) => analytics.middleware(makeReq(), r1, resolve));
    assert.strictEqual(r1._headers["x-usage-remaining"], "99", "1 used, 99 remaining");
    assert.strictEqual(r1._headers["x-usage-limit"], "100", "limit header");

    const r2 = makeRes();
    await new Promise((resolve) => analytics.middleware(makeReq(), r2, resolve));
    assert.strictEqual(r2._headers["x-usage-remaining"], "98", "2 used, 98 remaining");

    console.log("    ✓ usage headers OK");
  })();
}

function testMiddlewareAttachesApiKey() {
  console.log("  middleware attaches apiKey…");
  const analytics = createAnalyticsMiddleware({
    stripeSecretKey: "sk_test_fake",
    apiKeyHeader: "x-api-key",
    defaultRateLimit: 100,
  });

  let capturedKey = null;
  const req = makeReq({ headers: { "x-api-key": "my-secret-key" } });
  const res = makeRes();

  // Wrap next to capture the request after middleware runs
  analytics.middleware(req, res, () => {
    capturedKey = req.apiKey;
  });

  assert.strictEqual(capturedKey, "my-secret-key", "apiKey attached to req");
  assert.strictEqual(res.statusCode, 200, "next() was called");
  console.log("    ✓ apiKey attachment OK");
}

// ============================================================
// BATCH
// ============================================================

async function main() {
  const start = Date.now();
  let passed = 0;
  let failed = 0;

  const suites = [
    // Sync tests + async middleware tests
    async () => {
      testRateLimiterCheck();
      testRateLimiterRemaining();
      testRateLimiterReset();
      await testMiddlewareRequiresApiKey();
      await testMiddlewareEnforcesRateLimit();
      await testMiddlewareUsageHeaders();
      testMiddlewareAttachesApiKey();
      passed += 7;
    },
    // Async-only tests
    async () => {
      await testUsageTrackerRecordHit();
      await testUsageTrackerGetUsageEmpty();
      await testUsageTrackerMultiKey();
      await testUsageTrackerReset();
      await testRateLimiterWindowReset();
      passed += 5;
    },
  ];

  for (const suite of suites) {
    try {
      await suite();
    } catch (err) {
      failed += 1;
      console.log(`    ✗ suite: ${err.message}\n${err.stack}`);
    }
  }

  // Extra wait for the window-reset test inside the async suite
  await new Promise((r) => setTimeout(r, 200));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  ${passed} passed, ${failed} failed (${elapsed}s)\n`);

  if (failed > 0) process.exit(1);
}

main();
