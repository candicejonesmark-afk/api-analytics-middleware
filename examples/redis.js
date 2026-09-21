/**
 * Redis-backed example with multiple API keys.
 */
const express = require('express');
const { createAnalyticsMiddleware } = require('../src/index');

const app = express();

const analytics = createAnalyticsMiddleware({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
  apiKeyHeader: 'x-api-key',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  defaultRateLimit: 1000,
  defaultWindowSec: 60
});

app.use(analytics.middleware);
app.use(analytics.usageApi.router);

app.get('/api/data', (req, res) => {
  res.json({ data: 'hello', key: req.apiKey });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Redis-backed example on port ${PORT}`);
});
