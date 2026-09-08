import Stripe from 'stripe';
import { CommerceCatalogError } from '@/lib/commerce/catalog';
import { assertSaviProductionConfiguration } from '@/lib/config/saviConfig';

let stripeClient: Stripe | null = null;

function requiredStripeSecret(name: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new CommerceCatalogError('COMMERCE_NOT_CONFIGURED', 503, `${name} is not configured.`);
  }
  return value;
}

export function getStripeClient() {
  assertSaviProductionConfiguration('commerce');
  if (stripeClient) return stripeClient;
  stripeClient = new Stripe(requiredStripeSecret('STRIPE_SECRET_KEY'));
  return stripeClient;
}

export function constructStripeWebhookEvent(payload: string | Buffer, signature: string | null) {
  if (!signature) {
    throw new CommerceCatalogError('COMMERCE_NOT_CONFIGURED', 400, 'Stripe webhook signature is missing.');
  }
  return getStripeClient().webhooks.constructEvent(payload, signature, requiredStripeSecret('STRIPE_WEBHOOK_SECRET'));
}
