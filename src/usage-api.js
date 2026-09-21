"use strict";

/**
 * REST API router for checking current usage.
 * Mount at /analytics (or any prefix you choose).
 */
const express = require('express');

class UsageApi {
  /**
   * @param {UsageTracker} tracker - UsageTracker instance
   * @param {object} [opts]
   * @param {string} [opts.basePath='/analytics'] - Router mount path
   */
  constructor(tracker, opts = {}) {
    this.tracker = tracker;
    this.basePath = opts.basePath || '/analytics';
    this.router = express.Router();
    this._setupRoutes();
  }

  _setupRoutes() {
    // GET /analytics/usage/:apiKey - current usage for a key
    this.router.get('/usage/:apiKey', async (req, res) => {
      try {
        const usage = await this.tracker.getUsage(req.params.apiKey);
        res.json({ apiKey: req.params.apiKey, ...usage });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /analytics/usage - all keys (admin)
    this.router.get('/usage', async (req, res) => {
      try {
        const all = await this.tracker.getAllUsage();
        res.json(all);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // POST /analytics/usage/:apiKey/reset - reset usage
    this.router.post('/usage/:apiKey/reset', async (req, res) => {
      try {
        await this.tracker.resetUsage(req.params.apiKey);
        res.json({ reset: true, apiKey: req.params.apiKey });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // GET /analytics/health - liveness check
    this.router.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }
}

module.exports = { UsageApi };
