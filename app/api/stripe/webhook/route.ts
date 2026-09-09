import { NextRequest, NextResponse } from 'next/server';
import { CommerceCatalogError } from '@/lib/commerce/catalog';
import {
  handleStripeCheckoutCompleted,
  handleStripeDisputeEvent,
  handleStripeInvoicePaid,
  recordStripeEventOnly,
  syncStripeSubscription
} from '@/lib/commerce/server';
import { constructStripeWebhookEvent } from '@/lib/commerce/stripe';
import { logOperational } from '@/lib/observability/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let event;

  try {
    event = constructStripeWebhookEvent(await request.text(), request.headers.get('stripe-signature'));
  } catch (error) {
    logOperational('warn', 'stripe_webhook_verification_failed', { hasSignature: Boolean(request.headers.get('stripe-signature')) });
    const status = error instanceof CommerceCatalogError ? error.status : 400;
    return NextResponse.json({ error: 'Stripe webhook verification failed.', category: 'STRIPE_WEBHOOK_VERIFICATION_FAILED' }, { status });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleStripeCheckoutCompleted(event);
    } else if (event.type === 'invoice.payment_succeeded') {
      await handleStripeInvoicePaid(event);
    } else if (event.type === 'invoice.paid') {
      await recordStripeEventOnly(event, 'processed', 'recorded_invoice_paid_no_credit_change');
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await syncStripeSubscription(event);
    } else if (
      event.type === 'charge.dispute.created' ||
      event.type === 'charge.dispute.updated' ||
      event.type === 'charge.dispute.closed'
    ) {
      await handleStripeDisputeEvent(event);
    } else if (
      event.type === 'invoice.payment_failed' ||
      event.type === 'charge.refunded' ||
      event.type === 'refund.created'
    ) {
      const isRefund = event.type === 'charge.refunded' || event.type === 'refund.created';
      await recordStripeEventOnly(event, 'processed', isRefund ? 'recorded_refund' : 'recorded_no_credit_change');
    } else {
      await recordStripeEventOnly(event, 'ignored', 'unsupported_event_type');
    }

    return NextResponse.json({ received: true });
  } catch {
    logOperational('error', 'stripe_webhook_processing_failed', { eventType: event.type });
    return NextResponse.json({ error: 'SAVI could not process the Stripe webhook.', category: 'STRIPE_WEBHOOK_PROCESSING_FAILED' }, { status: 500 });
  }
}
