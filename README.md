# api-analytics-middleware

Open-source Express middleware for rate limiting, usage tracking, and Stripe metered billing.

## Features

- **Rate limiter** — sliding-window, per-API-key, configurable limits
- **Usage tracking** — Redis-backed (or in-memory fallback) per-key, per-endpoint counters
- **Stripe integration** — metered billing webhook handler, usage record reporting
- **Usage REST API** — check current usage, reset counters, health check

## Install

```bash
npm install api-analytics-middleware
```

## Quick Start

```js
const express = require('express');
const { createAnalyticsMiddleware } = require('api-analytics-middleware');

const app = express();

const analytics = createAnalyticsMiddleware({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  apiKeyHeader: 'x-api-key',
  defaultRateLimit: 100,
  defaultWindowSec: 60
});

// Attach middleware to every route
app.use(analytics.middleware);

// Mount the usage API at /analytics
app.use(analytics.usageApi.router);

// Your routes
app.get('/api/data', (req, res) => {
  res.json({ data: 'hello', usage: req.headers['x-usage-remaining'] });
});

// Stripe webhook endpoint
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  analytics.stripeHandler.handleWebhook(req.body, req.headers['stripe-signature'])
    .then(() => res.json({ received: true }))
    .catch(err => res.status(400).send(`Webhook error: ${err.message}`));
});

app.listen(3000);
```

## Configuration

| Option | Required | Default | Description |
|---|---|---|---|
| `stripeSecretKey` | Yes | — | Stripe secret key |
| `apiKeyHeader` | Yes | — | Header name carrying the API key |
| `redisUrl` | No | null | Redis URL for persistent storage |
| `defaultRateLimit` | No | 100 | Requests per window |
| `defaultWindowSec` | No | 60 | Sliding window size (seconds) |

## Usage Tracking

```js
// Record a weighted hit
await analytics.usageTracker.recordHit('api-key-123', '/api/data', 5);

// Get current usage
const usage = await analytics.usageTracker.getUsage('api-key-123');
// => { totalHits: 42, endpoints: { '/api/data': 42 } }
```

## Stripe Metered Billing

```js
// Report usage to Stripe
await analytics.stripeHandler.reportUsage('si_xxx', 10);

// Listen to events
analytics.stripeHandler.on('payment.failed', (event) => {
  console.log('Payment failed:', event.invoice.id);
});
```

## API Endpoints

Mount the usage router with `app.use(analytics.usageApi.router)`:

- `GET /analytics/usage/:apiKey` — current usage for a key
- `GET /analytics/usage` — all keys (admin)
- `POST /analytics/usage/:apiKey/reset` — reset usage
- `GET /analytics/health` — liveness check

## Redis

Set `redisUrl` to use Redis for persistent, multi-node usage tracking:

```js
const analytics = createAnalyticsMiddleware({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  apiKeyHeader: 'x-api-key',
  redisUrl: 'redis://localhost:6379'
});
```

Without Redis, usage is stored in-memory (single-process only).

## License

MIT
