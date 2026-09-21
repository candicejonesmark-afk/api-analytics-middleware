"use strict";

const { Redis } = require('ioredis');

/**
 * Tracks per-API-key usage with Redis persistence (falls back to in-memory).
 */
class UsageTracker {
  /**
   * @param {string|null} redisUrl - Redis connection URL, or null for in-memory
   */
  constructor(redisUrl = null) {
    this.redisUrl = redisUrl;
    this._memoryStore = new Map(); // key -> { totalHits, endpoints: { [path]: count } }
    this._redis = null;

    if (redisUrl) {
      this._redis = new Redis(redisUrl);
    }
  }

  /**
   * Record a hit for the given API key.
   * @param {string} apiKey
   * @param {string} endpoint - Request path
   * @param {number} [weight=1] - Weight of this hit (for metered billing)
   */
  async recordHit(apiKey, endpoint = '/', weight = 1) {
    if (this._redis) {
      const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const pipe = this._redis.pipeline();
      pipe.incrby(`usage:${apiKey}:${now}`, weight);
      pipe.incrby(`usage:${apiKey}:total`, weight);
      pipe.hincrby(`usage:${apiKey}:endpoints`, endpoint, weight);
      pipe.expire(`usage:${apiKey}:${now}`, 86400 * 30); // 30 day TTL
      pipe.expire(`usage:${apiKey}:total`, 86400 * 30);
      pipe.expire(`usage:${apiKey}:endpoints`, 86400 * 30);
      await pipe.exec();
    } else {
      if (!this._memoryStore.has(apiKey)) {
        this._memoryStore.set(apiKey, { totalHits: 0, endpoints: {} });
      }
      const entry = this._memoryStore.get(apiKey);
      entry.totalHits += weight;
      entry.endpoints[endpoint] = (entry.endpoints[endpoint] || 0) + weight;
    }
  }

  /**
   * Get usage summary for an API key.
   * @returns {object} { totalHits, endpoints: { [path]: count } }
   */
  async getUsage(apiKey) {
    if (this._redis) {
      const now = new Date().toISOString().slice(0, 10);
      const [total, endpoints] = await Promise.all([
        this._redis.get(`usage:${apiKey}:total`).then(v => parseInt(v || '0', 10)),
        this._redis.hgetall(`usage:${apiKey}:endpoints`)
      ]);
      return { totalHits: total, endpoints, period: now };
    }

    const entry = this._memoryStore.get(apiKey);
    if (!entry) return { totalHits: 0, endpoints: {} };
    return { totalHits: entry.totalHits, endpoints: { ...entry.endpoints } };
  }

  /**
   * Get usage for all tracked keys (admin endpoint).
   */
  async getAllUsage() {
    if (this._redis) {
      const keys = await this._redis.keys('usage:*:total');
      const results = {};
      for (const key of keys) {
        const apiKey = key.match(/usage:(.+?):total/)?.[1];
        if (apiKey) {
          const val = await this._redis.get(key);
          results[apiKey] = parseInt(val || '0', 10);
        }
      }
      return results;
    }

    const out = {};
    for (const [k, v] of this._memoryStore) {
      out[k] = v.totalHits;
    }
    return out;
  }

  /**
   * Reset usage for a key.
   */
  async resetUsage(apiKey) {
    if (this._redis) {
      const keys = await this._redis.keys(`usage:${apiKey}:*`);
      if (keys.length) await this._redis.del(...keys);
    } else {
      this._memoryStore.delete(apiKey);
    }
  }

  /**
   * Graceful shutdown: close Redis connection.
   */
  async close() {
    if (this._redis) {
      await this._redis.quit();
    }
  }
}

module.exports = { UsageTracker };
