"use strict";

/**
 * In-memory sliding-window rate limiter.
 * For production with multiple nodes, swap the store to Redis.
 */
class RateLimiterMemory {
  /**
   * @param {object} opts
   * @param {number} opts.defaultRateLimit - Requests per window
   * @param {number} opts.defaultWindowSec - Window size in seconds
   */
  constructor(opts = {}) {
    this.defaultRateLimit = opts.defaultRateLimit || 100;
    this.defaultWindowSec = opts.defaultWindowSec || 60;
    // key -> { count, resetAt }
    this._store = new Map();
  }

  /**
   * Check if a key is allowed to make a request.
   * @returns {boolean}
   */
  check(key, rateLimit = this.defaultRateLimit, windowSec = this.defaultWindowSec) {
    const now = Date.now();
    const entry = this._store.get(key);

    if (!entry || now > entry.resetAt) {
      this._store.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return true;
    }

    if (entry.count >= rateLimit) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  /**
   * Get remaining count for a key.
   */
  remaining(key, rateLimit = this.defaultRateLimit, windowSec = this.defaultWindowSec) {
    const entry = this._store.get(key);
    const now = Date.now();
    if (!entry || now > entry.resetAt) return rateLimit;
    return Math.max(0, rateLimit - entry.count);
  }

  /**
   * Reset a key's counters.
   */
  reset(key) {
    this._store.delete(key);
  }
}

module.exports = { RateLimiterMemory };
