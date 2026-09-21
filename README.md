# api-analytics-middleware

[![npm version](https://img.shields.io/npm/v/api-analytics-middleware.svg?label=npm)](https://www.npmjs.com/package/api-analytics-middleware)
[![CI](https://github.com/candicejonesmark-afk/api-analytics-middleware/actions/workflows/ci.yml/badge.svg)](https://github.com/candicejonesmark-afk/api-analytics-middleware/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Lightweight API middleware for Node.js + Express: per-customer **rate limiting** and **usage tracking** in a single package. No external database required for dev — an in-memory store is included; drop in Redis for production.

## Install

```bash
npm install api-analytics-middleware
```

Requires Node.js 16+ and Express 4.16+. No other dependencies.

## Quick start

```js
import express from "express";
import { createAnalyticsMiddleware } from "api-analytics-middleware";

const app = express();

const analytics = createAnalyticsMiddleware({
  apiKeyHeader: "x-api-key",        // header that carries the customer key
  defaultRateLimit: 100,            // max requests per window
  defaultWindowSec: 60,             // window length in seconds
});

// Apply to every route (or mount on specific routers)
app.use(analytics.middleware);

app.get("/api/data", (req, res) => {
  res.json({ ok: true });
});

app.listen(3000);
```

Every request then gets:

- A 401 if the `x-api-key` header is missing.
- A 429 if the customer exceeded `defaultRateLimit` requests in the last `defaultWindowSec` seconds.
- `X-Usage-Remaining` and `X-Usage-Limit` response headers telling the caller how many requests they have left.

## Features

| Feature | What it does |
|---|---|
| **API key auth** | Rejects requests missing the configured header with `401 MISSING_API_KEY`. |
| **Rate limiting** | Sliding-window limiter per API key. Returns `429 RATE_LIMIT_EXCEEDED` with `Retry-After` and rate-limit headers. |
| **Usage tracking** | Increments a per-customer counter on every allowed request and surfaces it as response headers. |
| **Zero-config dev** | Everything works with an in-memory store out of the box — no Redis or DB needed to try it. |

## API

### `createAnalyticsMiddleware(options)`

Creates the middleware factory. Returns `{ middleware, rateLimiter, usageTracker }`.

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKeyHeader` | `string` | `"x-api-key"` | Request header that carries the customer identifier. |
| `defaultRateLimit` | `number` | `100` | Max requests per window per customer. |
| `defaultWindowSec` | `number` | `60` | Sliding window length in seconds. |
| `onRateLimited` | `function` | logs to console | Hook called when a request is rate-limited. Receives `(req, res, limit, windowSec)`. |

### Returned objects

#### `analytics.middleware(req, res, next)`

The Express middleware. Call it as `app.use(analytics.middleware)` or per-route. It is **async** — do not call it without awaiting or passing a `next` that handles the promise.

#### `analytics.rateLimiter`

A `RateLimiterMemory` instance you can use directly:

| Method | Returns | Description |
|---|---|---|
| `check(key, limit, windowSec)` | `boolean` | Allow or deny a request for this key. |
| `remaining(key)` | `number` | Requests left for this key in the current window. |
| `reset(key)` | `void` | Clear the counter for a key. |

Note: `check` is synchronous in the in-memory store. When you switch to a Redis-backed store the API is the same but `check` may be async.

#### `analytics.usageTracker`

A `UsageTracker` instance:

| Method | Returns | Description |
|---|---|---|---|
| `recordHit(key, path, value)` | `Promise<void>` | Record one unit of usage for this customer. |
| `getUsage(key)` | `Promise<{ totalHits, endpoints }>` | Current usage for a customer. |
| `getAllUsage()` | `Promise<Record<string, number>>` | Total hits for every customer. |
| `resetUsage(key)` | `Promise<void>` | Clear usage for a customer. |

## Per-customer limits

Override the rate limit or window per request with headers on the incoming request:

| Request header | Effect |
|---|---|
| `x-rate-limit` | Override `defaultRateLimit` for this request's key. |
| `x-rate-window` | Override `defaultWindowSec` for this request's key. |

```js
// A premium customer gets 1000 req/min instead of 100
app.get("/premium", (req, res, next) => {
  res.set("x-rate-limit", "1000");
  res.set("x-rate-window", "60");
  analytics.middleware(req, res, next);
});
```

## Testing

The test suite uses the in-memory store, so no Redis is needed:

```bash
npm install
npm test
```

This runs both `test/smoke.js` (a basic end-to-end smoke test) and `test/usage.test.js` (unit tests covering the rate limiter, usage tracker, and full middleware stack).

## Redis

The default in-memory store is fine for local development and single-process hosts, but counters reset when the process restarts and don't share state across instances. For production multi-instance deployments, plug in a Redis-backed store.

The interface `RateLimiterStore` and `UsageTrackerStore` expose is:

```ts
interface RateLimiterStore {
  check(key: string, limit: number, windowSec: number): boolean | Promise<boolean>;
  reset(key: string): void | Promise<void>;
}

interface UsageTrackerStore {
  recordHit(key: string, path: string, value: number): void | Promise<void>;
  getUsage(key: string): UsageSnapshot | Promise<UsageSnapshot>;
  getAllUsage(): Record<string, number> | Promise<Record<string, number>>;
  resetUsage(key: string): void | Promise<void>;
}

interface UsageSnapshot {
  totalHits: number;
  endpoints: Record<string, number>;
}
```

Drop a class implementing those into `src/stores/` and pass it to `createAnalyticsMiddleware({ rateLimitStore, usageStore })`.

## License

MIT © [candi](https://github.com/candicejonesmark-afk)
