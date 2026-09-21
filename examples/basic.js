/**
 * Basic usage example — single-process, in-memory.
 */
const express = require('express');
const { createAnalyticsMiddleware } = require('../src/index');

const app = express();

const analytics = createAnalyticsMiddleware({
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
  apiKeyHeader: 'x-api-key',
  defaultRateLimit: 5,
  defaultWindowSec: 60
});

app.use(analytics.middleware);
app.use(analytics.usageApi.router);

app.get('/api/data', (req, res) => {
  res.json({ data: 'hello', remaining: req.headers['x-usage-remaining'] });
});

app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    await analytics.stripeHandler.handleWebhook(req.body, req.headers['stripe-signature']);
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Example running on port ${PORT}`);
  console.log(`Try: curl -H "x-api-key: test-key" http://localhost:${PORT}/api/data`);
});
