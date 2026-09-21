"use strict";

const { RateLimiterMemory } = require('./rate-limiter');
const { UsageTracker } = require('./usage-tracker');
const { StripeWebhookHandler } = require('./stripe-webhooks');
const { UsageApi } = require('./usage-api');

/**
 * Create the full analytics middleware stack.
 *
 * @param {object} opts
 * @param {string} opts.stripeSecretKey - Stripe secret key for metered billing
 * @param {string} [opts.redisUrl] - Redis URL (optional; falls back to in-memory)
 * @param {string} opts.apiKeyHeader - Header name carrying the API key (default: 'x-api-key')
 * @param {number} [opts.defaultRateLimit=100] - Default requests per window
 * @param {number} [opts.defaultWindowSec=60] - Sliding window size in seconds
 * @returns {object} { rateLimiter, usageTracker, stripeHandler, usageApi, middleware }
 */
function createAnalyticsMiddleware(opts = {}) {
  if (!opts.stripeSecretKey) {
    throw new Error('api-analytics-middleware: opts.stripeSecretKey is required');
  }
  if (!opts.apiKeyHeader) {
    throw new Error('api-analytics-middleware: opts.apiKeyHeader is required');
  }

  const redisUrl = opts.redisUrl || null;
  const apiKeyHeader = opts.apiKeyHeader;
  const defaultRateLimit = opts.defaultRateLimit || 100;
  const defaultWindowSec = opts.defaultWindowSec || 60;

  const rateLimiter = new RateLimiterMemory({ defaultRateLimit, defaultWindowSec });
  const usageTracker = new UsageTracker(redisUrl);
  const stripeHandler = new StripeWebhookHandler(opts.stripeSecretKey);
  const usageApi = new UsageTracker(redisUrl);

  /**
   * Express middleware: identifies the caller by API key, enforces rate limit,
   * and records each request against the key.
   */
  async function middleware(req, res, next) {
    const apiKey = req.headers[apiKeyHeader];
    if (!apiKey) {
      res.status(401).json({ error: 'Missing API key', code: 'MISSING_API_KEY' });
      return;
    }

    // Attach key to request for downstream handlers
    req.apiKey = apiKey;

    // Check rate limit
    const limit = req.headers['x-rate-limit']
      ? parseInt(req.headers['x-rate-limit'], 10)
      : defaultRateLimit;
    const windowSec = req.headers['x-rate-window']
      ? parseInt(req.headers['x-rate-window'], 10)
      : defaultWindowSec;

    const allowed = rateLimiter.check(apiKey, limit, windowSec);
    if (!allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        limit,
        windowSec
      });
      return;
    }

    // Track usage
    usageTracker.recordHit(apiKey, req.path || req.url, 1).catch(() => {});

    // Attach usage headers to response
    try {
      const usage = await usageTracker.getUsage(apiKey);
      res.setHeader('X-Usage-Remaining', Math.max(0, limit - (usage.count || usage.totalHits || 0)));
      res.setHeader('X-Usage-Limit', limit);
    } catch {
      // If we can't read usage, still continue — don't block the request
    }

    next();
  }

  return {
    rateLimiter,
    usageTracker,
    stripeHandler,
    usageApi: new UsageApi(usageTracker),
    middleware
  };
}

module.exports = { createAnalyticsMiddleware };
