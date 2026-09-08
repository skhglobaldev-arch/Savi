import { NextRequest, NextResponse } from 'next/server';
import { CommerceCatalogError } from '@/lib/commerce/catalog';
import {
  handleStripeCheckoutCompleted,
  handleStripeInvoicePaid,
  recordStripeEventOnly,
  syncStripeSubscription
} from '@/lib/commerce/server';
import { constructStripeWebhookEvent } from '@/lib/commerce/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let event;

  try {
    event = constructStripeWebhookEvent(await request.text(), request.headers.get('stripe-signature'));
  } catch (error) {
    const status = error instanceof CommerceCatalogError ? error.status : 400;
    return NextResponse.json({ error: 'Stripe webhook verification failed.', category: 'STRIPE_WEBHOOK_VERIFICATION_FAILED' }, { status });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleStripeCheckoutCompleted(event);
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      await handleStripeInvoicePaid(event);
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await syncStripeSubscription(event);
    } else if (
      event.type === 'invoice.payment_failed' ||
      event.type === 'charge.refunded' ||
      event.type === 'refund.created' ||
      event.type === 'charge.dispute.created'
    ) {
      const isRefund = event.type === 'charge.refunded' || event.type === 'refund.created';
      const isDispute = event.type === 'charge.dispute.created';
      await recordStripeEventOnly(event, 'processed', isRefund ? 'recorded_refund' : isDispute ? 'recorded_dispute' : 'recorded_no_credit_change');
    } else {
      await recordStripeEventOnly(event, 'ignored', 'unsupported_event_type');
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'SAVI could not process the Stripe webhook.', category: 'STRIPE_WEBHOOK_PROCESSING_FAILED' }, { status: 500 });
  }
}
