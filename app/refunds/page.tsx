import type { Metadata } from 'next';
import { LegalPageShell, LegalSection, LegalList } from '@/components/LegalPageShell';
import { getLegalConfiguration } from '@/lib/legal/config';

export const metadata: Metadata = { title: 'Refund and Billing Policy · SAVI' };
export const dynamic = 'force-dynamic';

export default function RefundsPage() {
  const legal = getLegalConfiguration();

  return (
    <LegalPageShell
      eyebrow="Billing"
      title="Refund and Billing Policy"
      description="This page reflects the current SAVI credit and subscription implementation. Refund eligibility, statutory cancellation wording, and the final operator contact must be approved before paid launch."
    >
      <LegalSection title="1. Plans and credits">
        <LegalList items={[
          'The free plan provides a one-time 300-credit welcome grant.',
          'Paid web plans are billed monthly and provide recurring subscription credits according to the selected plan.',
          "Subscription credits can roll over up to two times the plan's monthly allocation.",
          'One-time top-up credits do not expire under the current implementation.',
          'Welcome credits are not treated as expiring subscription credits under the current implementation.'
        ]} />
        <p>The subscription rollover cap affects subscription-derived credits only. It does not reduce purchased top-up credits or the welcome-credit bucket, and it does not cap the total account balance.</p>
      </LegalSection>

      <LegalSection title="2. Billing provider">
        <p>Web checkout and billing-portal flows are designed for Stripe. SAVI receives verified webhook events and records payment, subscription, purchase, and credit-grant state. Card details are handled by Stripe rather than stored in SAVI's application database.</p>
        <p>If Apple in-app purchases are introduced later, those transactions may use Apple's billing and refund rules separately from web purchases.</p>
      </LegalSection>

      <LegalSection title="3. Subscription renewal and cancellation">
        <p>A paid plan grants recurring subscription credits only after a qualifying paid renewal event is verified. A failed renewal does not create a new recurring credit grant.</p>
        <p>Cancellation takes effect at the actual end of the current billing period. Until then, the current subscription state remains available. Cancellation does not currently delete purchased top-up credits or welcome credits.</p>
      </LegalSection>

      <LegalSection title="4. Credit use and plan changes">
        <p>When a paid tool runs, SAVI reserves credits from the subscription-derived bucket first and records the reservation. A successful operation finalizes that reservation; a failed operation releases the same bucket. Top-up and welcome credits are tracked in the general available balance and are not destroyed by the subscription rollover cap.</p>
        <p>Changing plans does not currently confiscate purchased credits. If the subscription-derived balance is above a new plan's rollover cap, the cap is applied to the subscription-derived grant capacity on a subsequent recurring grant; the purchased and welcome portions remain outside that cap.</p>
      </LegalSection>

      <LegalSection title="5. Refunds and disputes">
        <p>The current webhook path records refund and dispute events against the relevant purchase. It does not blindly force an account into a negative credit balance or automatically deduct previously granted credits. This describes current implementation behavior and is not a promise that every dispute or refund request will be accepted.</p>
        <p>Refund eligibility, statutory cancellation rights, any request time window, and the treatment of unused or already-consumed credits must be finalized by the operator and reviewed under applicable UK consumer law before launch. Until then, refund requests should be sent to {legal.contactEmail} and will be reviewed individually according to applicable law and the final published rules.</p>
      </LegalSection>

      <LegalSection title="6. Payment issues">
        <p>If a checkout is cancelled, SAVI does not treat the cancelled checkout as a successful credit grant. Credits are added only after the verified payment event is processed. Contact {legal.contactEmail} with the relevant account and transaction details, but do not send full card numbers.</p>
      </LegalSection>

      <LegalSection title="7. Required launch decisions">
        <p>The operator must fill the legal contact configuration, approve refund eligibility and statutory cancellation wording, define how refunds and disputes are handled after credits have been used, and confirm the final Stripe and any future Apple support processes before accepting paid customers.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
