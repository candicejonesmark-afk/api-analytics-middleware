"use strict";

const stripe = require('stripe');

/**
 * Handles Stripe metered billing webhooks and emits usage records.
 *
 * Expects Stripe events:
 *   - customer.subscription.trial_will_end
 *   - invoice.payment_succeeded
 *   - invoice.payment_failed
 *
 * Usage records are created via Stripe's UsageRecord API for metered plans.
 */
class StripeWebhookHandler {
  /**
   * @param {string} secretKey - Stripe secret key
   * @param {object} [opts]
   * @param {string} [opts.webhookSecret] - Stripe webhook signing secret (recommended)
   */
  constructor(secretKey, opts = {}) {
    this.stripe = stripe(secretKey);
    this.webhookSecret = opts.webhookSecret || null;
    this._listeners = [];
  }

  /**
   * Register an event listener.
   * @param {string} eventType - e.g. 'usage.exceeded', 'payment.failed'
   * @param {function} fn - async callback(event)
   */
  on(eventType, fn) {
    this._listeners.push({ eventType, fn });
  }

  async _emit(eventType, data) {
    for (const l of this._listeners) {
      if (l.eventType === eventType) {
        try { await l.fn(data); } catch (e) { /* log outside */ }
      }
    }
  }

  /**
   * Verify and handle an incoming Stripe webhook.
   * @param {string} payload - Raw request body
   * @param {string} sig - Stripe-Signature header
   * @returns {object} Parsed Stripe event
   */
  async handleWebhook(payload, sig) {
    let event;

    if (this.webhookSecret) {
      event = this.stripe.webhooks.constructEvent(payload, sig, this.webhookSecret);
    } else {
      event = JSON.parse(payload);
    }

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this._handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this._handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.trial_will_end':
        await this._handleTrialWillEnd(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this._handleSubscriptionDeleted(event.data.object);
        break;
      default:
        // Unhandled event type — log for debugging
        break;
    }

    return event;
  }

  /**
   * Create a Stripe usage record for a metered subscription item.
   * Call this from your app when you want to report usage to Stripe.
   *
   * @param {string} subscriptionItemId - Stripe subscription item ID
   * @param {number} quantity - Units of usage to report
   * @param {object} [opts]
   * @param {number} [opts.timestamp] - Unix timestamp (default: now)
   * @param {string} [opts.action='increment'] - 'increment' or 'set'
   */
  async reportUsage(subscriptionItemId, quantity, opts = {}) {
    const record = await this.stripe.subscriptionItems.createUsageRecord(
      subscriptionItemId,
      {
        quantity,
        timestamp: opts.timestamp || Math.floor(Date.now() / 1000),
        action: opts.action || 'increment'
      }
    );
    await this._emit('usage.reported', { record, subscriptionItemId, quantity });
    return record;
  }

  /**
   * Get the current usage summary for a customer's subscription.
   * @param {string} subscriptionId - Stripe subscription ID
   * @returns {object} Usage per subscription item
   */
  async getSubscriptionUsage(subscriptionId) {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });

    const usage = {};
    for (const item of sub.items.data) {
      const price = item.price;
      usage[item.id] = {
        priceId: price.id,
        product: price.product,
        unitAmount: price.unit_amount,
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end
      };
    }
    return usage;
  }

  // --- Internal handlers ---

  async _handlePaymentSucceeded(invoice) {
    await this._emit('payment.succeeded', { invoice });
  }

  async _handlePaymentFailed(invoice) {
    await this._emit('payment.failed', { invoice });
    await this._emit('usage.exceeded', { invoice });
  }

  async _handleTrialWillEnd(subscription) {
    await this._emit('trial.will_end', { subscription });
  }

  async _handleSubscriptionDeleted(subscription) {
    await this._emit('subscription.deleted', { subscription });
  }
}

module.exports = { StripeWebhookHandler };
