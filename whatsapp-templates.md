# Candai — WhatsApp Message Templates

These are the real copy sequences that run on the WhatsApp channel. Three flows: onboarding, usage nudges, billing alerts. Each message is standalone and self-contained — no thread dependency, works regardless of previous state.

Design rules across all three flows:
- One idea per message. Never bundle two asks in one WhatsApp.
- Plain text. No images, no links except where explicitly noted. Links reduce open rates on WhatsApp for this audience.
- Voice: direct, concise, no filler. "Your API hit 80% of your limit today" — not "We hope this message finds you well and wanted to let you know..."
- Timing matters more than frequency. See the cadence notes under each flow.

---

## Flow 1 — Onboarding (new API key activated)

Trigger: a customer creates their first API key in the Candai dashboard (or you provision one manually).

### Message 1 — Welcome + first value (immediate)

```
Candai activated your API key. Every request to your API is now counted and rate-limited automatically.

Your dashboard: [dashboard URL — replace before sending]

Reply STOP to pause usage alerts. Reply HELP for support.
```

Send: immediately on key creation.

Purpose: confirm the key is live, give them one place to go, set expectations for what happens next. The STOP/HELP line is WhatsApp compliance hygiene — include it in every first-touch message in this flow.

### Message 2 — First usage milestone (when first hit is recorded)

Trigger: the first API hit is recorded against this customer's key.

```
Your first API call was just logged. You're live.

Usage so far:
- Requests: 1
- Window: 100 req / 60s
- Status: within limit

Reply with your next question — we read every message.
```

Send: within 60 seconds of the first hit.

Purpose: prove the thing works immediately. A customer who sees their first hit logged within a minute of activating the key trusts the product. This message is the trust anchor.

### Message 3 — Rate limit education (after first rate-limit event, if any)

Trigger: the customer's key hits a rate limit (429 response).

```
Your API key hit its rate limit: [N] requests in [window] seconds.

Your limit: [limit] requests per [window] seconds.

To raise it: reply RAISE + your target (e.g. "RAISE 500").
To see your full usage: visit your dashboard.

This limit is per API key, not per user — so if your clients share a key, they share the limit.
```

Send: within 60 seconds of the 429.

Purpose: turn a failure into a teachable moment. Most customers hit limits because they don't know they have one. This message educates and offers an immediate action (RAISE).

### Message 4 — End of onboarding (day 3, if no usage yet)

Trigger: 3 days since key activation, zero hits recorded.

```
Your API key is active but hasn't received any requests yet.

If your API is live and you're not seeing traffic, check:
1. The x-api-key header is being sent on every request
2. The key is the one you created in your Candai dashboard
3. Your server is running with the middleware mounted

Happy to debug with you — reply with what you're seeing.
```

Send: once, 3 days after activation. Do not re-send if they've had any hits in that window.

Purpose: rescue inactive accounts before they churn silently. Most "why isn't this working" questions are header or config issues — this message addresses the top three in one hit.

---

## Flow 2 — Usage Nudges

Purpose: keep customers aware of their usage without spamming. These are informative, not salesy. The goal is to build the habit of checking usage, which drives upgrade decisions later.

### Message A — Weekly usage summary (sent Monday, 09:00 local)

Trigger: every Monday, for customers who had ≥1 hit in the previous week.

```
Your API usage last week:

[Customer name/ID]:
- Total requests: [N]
- Peak rate: [N] req/s
- Rate limit breaches: [N]
- Current limit: [N] req / [window]s

[If breaches > 0]: You hit your rate limit [N] time(s) last week. Reply RAISE [number] to increase it.

[If no breaches]: You stayed within limit all week. At this rate, you're on track for [estimated monthly volume].

Dashboard: [dashboard URL]
```

Send: Monday 09:00 customer local time (store timezone from signup; default to UTC if unknown).

Cadence: weekly. Not daily. Daily usage summaries are noise; weekly builds a rhythm.

### Message B — Approaching rate limit warning (proactive)

Trigger: customer has used ≥80% of their rate limit window within the current window.

```
Heads up — your API key is at [N]% of its rate limit for this window.

Limit: [N] requests per [window] seconds
Used: [N] requests

You have [seconds] seconds left in this window before requests are throttled.

To raise your limit now: reply RAISE [target number].
```

Send: within 60 seconds of crossing the 80% threshold.

Cadence: at most once per window per customer. Do not send again until the next window.

Purpose: prevent 429s before they happen. Customers who get warned before hitting a limit trust the product more than customers who get hit with a 429 unannounced.

### Message C — High-volume flag (daily)

Trigger: customer exceeds a configurable volume threshold in a single day (default: 10,000 requests — adjust per plan).

```
Your API had [N] requests today — that's [X]% above your daily average.

If this is expected (a launch, batch job, etc.), no action needed. Your limit covers it.

If this is unexpected, reply CHECK — we'll look at the pattern with you.
```

Send: within 60 seconds of the threshold being crossed.

Cadence: at most once per day per customer.

Purpose: surface anomalies. A sudden spike might be a real usage increase (upgrade signal) or a config problem (looping client, DDoS). Either way, it's worth a human looking at it.

---

## Flow 3 — Billing Alerts

Purpose: transparent billing. Stripe handles the money; Candai handles the communication. These messages make sure the customer never sees a charge they didn't expect.

### Message D — Usage-based charge estimate (weekly)

Trigger: every Monday, for customers on the Early Adopter plan with Stripe metered billing active.

```
Your usage-based billing summary for last week:

- Requests billed: [N]
- Meter rate: $[X] per [unit] (e.g. per 1,000 requests)
- Estimated charge for last week: $[amount]
- YTD charges: $[amount]
- Current plan: Early Adopter ($29/month)

Your Stripe invoice for this period will be generated on [date].
You can view your usage in detail: [dashboard URL]

Questions about your bill? Reply BILL — we'll walk through it.
```

Send: Monday 09:00 customer local time.

Cadence: weekly.

Purpose: billing surprise is the #1 cause of churn in usage-based pricing. Weekly estimate messages eliminate surprise. Customers who know what they'll be charged don't dispute invoices.

### Message E — Threshold alert (configurable)

Trigger: estimated monthly usage crosses a configurable threshold (default: 80% of the next invoice tier, or a customer-defined budget cap).

```
Your usage is tracking toward $[amount] in charges this month.

Current month-to-date: $[amount]
Estimated at current rate: $[amount]

Your configured budget cap: $[amount] (if set)

To adjust your budget cap: reply BUDGET [new amount] or visit your dashboard.
To talk to someone before the charge: reply TALK.
```

Send: within 60 seconds of crossing the threshold.

Cadence: at most once per threshold crossing. Re-send only if usage continues to rise and crosses the next threshold tier.

### Message F — Invoice generated (Stripe webhook trigger)

Trigger: Stripe fires an invoice.payment_succeeded or invoice.created webhook for this customer.

```
Your usage invoice has been generated.

Amount: $[amount]
Period: [start date] – [end date]
Invoice: [Stripe invoice ID — link to Stripe dashboard]

You can view and download the full invoice in your Stripe dashboard.

Reply BILL if you have a question about this charge.
```

Send: within 60 seconds of the Stripe webhook.

Cadence: per invoice.

Purpose: confirmation. The customer should receive a message every time a charge happens, with enough detail to verify it themselves.

---

## STOP / HELP / compliance

These are required for WhatsApp Business API compliance. Include them in the first message of every flow, and honor them globally.

- **STOP**: immediately suppress all outbound WhatsApp messages to this number except billing alerts (charge confirmations are considered transactional and are exempt in most jurisdictions — confirm with legal for your region). Log the STOP event. Do not send a confirmation of the STOP itself (that would be another message).
- **UNSTOP**: customer replies UNSTOP or starts a new conversation. Resume normal flows from the current point.
- **HELP**: reply with a human-readable help message:

```
Candai usage alerts — here's what you can do:

- RAISE [number] — increase your rate limit
- BUDGET [amount] — set a monthly spend cap
- STOP — pause all alerts (billing confirmations still sent)
- START — resume alerts after STOP
- CHECK — have our team look at unusual usage
- BILL — talk to us about your invoice

Dashboard: [dashboard URL]
```

Send: immediately on HELP keyword.

---

## Implementation notes

- All `[placeholders]` are replaced at send time from your customer and usage data. The middleware gives you per-key usage; Stripe gives you meter/usage records; you merge them at the message layer.
- Timestamps: always convert to the customer's local time for human-readable dates in messages. Store timezone at signup.
- Rate limiting on the WhatsApp sender side: don't send more than one WhatsApp message to the same number within 5 minutes unless it's a triggered alert (threshold, 429, invoice). This protects your WhatsApp Business account from rate limits on Meta's side.
- Store every outbound message ID and status (sent/delivered/read) if you want delivery analytics. WhatsApp Business API supports message status webhooks.
- These templates assume the WhatsApp Business Platform (NOT the consumer WhatsApp app). You need a Meta Business Account, a WhatsApp Business Account, and a verified phone number. Setup is separate from Candai.
