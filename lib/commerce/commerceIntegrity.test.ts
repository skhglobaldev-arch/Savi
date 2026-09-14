import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canReceiveRecurringSubscriptionGrant,
  shouldGrantSubscriptionCredits,
  subscriptionGrantKey,
  topUpGrantKey
} from './fulfillment.ts';

test('locked catalog economics and rollover caps remain unchanged', () => {
  const catalog = readFileSync(new URL('./catalog.ts', import.meta.url), 'utf8');
  for (const [plan, credits, cap] of [['starter', 3000, 6000], ['creator', 7500, 15000], ['pro', 17500, 35000]]) {
    const section = catalog.slice(catalog.indexOf(`id: '${plan}'`), catalog.indexOf(`id: '${plan}'`) + 700);
    assert.match(section, new RegExp(`includedRecurringCredits: ${credits}`));
    assert.match(section, new RegExp(`rolloverCapCredits: ${cap}`));
  }
  for (const credits of [1000, 3000, 7500, 15000]) assert.match(catalog, new RegExp(`creditsGranted: ${credits}`));
});

test('Stripe grant identities are deterministic and idempotent', () => {
  assert.equal(topUpGrantKey({ provider: 'stripe', providerPaymentIntentId: 'pi_123' }), 'stripe:topup:pi_123');
  assert.notEqual(topUpGrantKey({ provider: 'stripe', providerPaymentIntentId: 'pi_123' }), topUpGrantKey({ provider: 'stripe', providerPaymentIntentId: 'pi_456' }));
  const cycle = { provider: 'stripe', providerSubscriptionId: 'sub_123', providerInvoiceId: 'in_123', billingPeriodStart: '2026-09-01T00:00:00.000Z', billingPeriodEnd: '2026-10-01T00:00:00.000Z' };
  assert.equal(subscriptionGrantKey(cycle), subscriptionGrantKey(cycle));
  assert.notEqual(subscriptionGrantKey(cycle), subscriptionGrantKey({ ...cycle, providerInvoiceId: 'in_456' }));
});

test('only a paid invoice and an entitled subscription can create a recurring grant', () => {
  assert.equal(shouldGrantSubscriptionCredits('paid', false), true);
  assert.equal(shouldGrantSubscriptionCredits('open', false), false);
  assert.equal(canReceiveRecurringSubscriptionGrant('active', 'active'), true);
  assert.equal(canReceiveRecurringSubscriptionGrant('trialing', 'trialing'), true);
  assert.equal(canReceiveRecurringSubscriptionGrant('past_due', 'past_due'), false);
  assert.equal(canReceiveRecurringSubscriptionGrant('canceled', 'canceled'), false);
});

test('webhook policy keeps invoice.paid record-only and status/event writes atomic', () => {
  const webhook = readFileSync(new URL('../../app/api/stripe/webhook/route.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
  const operations = readFileSync(new URL('../../dataconnect/savi/operations.gql', import.meta.url), 'utf8');
  assert.match(webhook, /invoice\.payment_succeeded[\s\S]*handleStripeInvoicePaid/);
  assert.match(webhook, /invoice\.paid[\s\S]*recorded_invoice_paid_no_credit_change/);
  assert.match(server, /RecordPaymentEventAndUpdatePurchaseStatus/);
  assert.match(operations, /mutation RecordPaymentEventAndUpdatePurchaseStatus[\s\S]*@transaction/);
});

test('subscription disputes retain metadata and do not imply destructive credit reversal', () => {
  const server = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
  assert.match(server, /recorded_dispute/);
  assert.match(server, /subscription_not_entitled_for_recurring_grant/);
  assert.doesNotMatch(server, /availableCredits_update:\s*\{\s*dec/);
});

test('welcome grants are locked to one canonical 300-credit entitlement', () => {
  const operations = readFileSync(new URL('../../dataconnect/savi/operations.gql', import.meta.url), 'utf8');
  const grantOperation = operations.slice(operations.indexOf('mutation GrantWelcomeCredit'), operations.indexOf('mutation ReconcileDuplicateWelcomeGrant'));
  assert.match(grantOperation, /WELCOME_GRANT_NOT_ALLOWED/);
  assert.match(grantOperation, /grantType: \{ eq: "welcome_grant" \}/);
  assert.match(grantOperation, /credits: 300/);
  assert.match(grantOperation, /availableCredits_update: \{ inc: 300 \}/);
});
