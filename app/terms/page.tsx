import type { Metadata } from 'next';
import { LegalPageShell, LegalSection, LegalList } from '@/components/LegalPageShell';
import { getLegalConfiguration } from '@/lib/legal/config';

export const metadata: Metadata = { title: 'Terms of Service · SAVI' };
export const dynamic = 'force-dynamic';

export default function TermsPage() {
  const legal = getLegalConfiguration();

  return (
    <LegalPageShell
      eyebrow="Terms"
      title="Terms of Service"
      description="These terms describe the rules for using SAVI's AI workspace, generated assets, credits, subscriptions, and web billing. The operator details below must be completed before launch."
    >
      <LegalSection title="1. Operator and acceptance">
        <p>These terms are provided by {legal.operatorName}, whose business address is {legal.businessAddress}. They take effect on {legal.effectiveDate}. By creating or using a SAVI account, or by continuing after these terms are presented, you agree to them and the Privacy Policy. If you do not agree, do not use SAVI.</p>
        <p>The governing-law and venue provision is not finalized. It must be set to {legal.governingLaw} after professional legal review before launch.</p>
      </LegalSection>

      <LegalSection title="2. Accounts and responsibilities">
        <LegalList items={[
          'use an account and Google identity that you are authorized to use;',
          'keep your Google account and device secure;',
          'provide information that is accurate enough for account and billing operations;',
          'review requests before sending them to an AI provider; and',
          'tell us promptly about suspected unauthorized access or billing activity.'
        ]} />
        <p>One person or organization may not use SAVI to evade limits, duplicate welcome grants, bypass payment controls, or interfere with another user's account.</p>
      </LegalSection>

      <LegalSection title="3. Acceptable use">
        <p>You must not use SAVI to break the law, infringe rights, distribute malware, attempt unauthorized access, probe or overload the service, abuse providers, submit content you lack permission to use, or create content intended to facilitate serious harm. You remain responsible for the prompts, files, references, and instructions you submit.</p>
        <p>SAVI may reject requests, apply rate limits, or suspend access where reasonably necessary to protect users, providers, the service, or legal obligations.</p>
      </LegalSection>

      <LegalSection title="4. Your content and generated content">
        <p>You retain the rights you already have in content you submit, subject to the rights and permissions of other people and providers. You give SAVI the limited permission needed to host, transmit, transform, analyze, and return that content to provide the requested service.</p>
        <p>AI outputs may be similar to outputs provided to other users, may contain material that requires review, and may be subject to third-party provider terms. SAVI does not promise that an output is unique, accurate, lawful, non-infringing, or suitable for a particular purpose. You are responsible for checking outputs and deciding whether and how to use them.</p>
      </LegalSection>

      <LegalSection title="5. AI and professional decisions">
        <p>SAVI is a general creative and productivity tool. It is not a substitute for legal, medical, financial, safety, or other professional advice. Do not rely on an output for a high-impact decision without appropriate independent review. See the dedicated AI Usage / AI Output Disclaimer.</p>
      </LegalSection>

      <LegalSection title="6. Credits and subscriptions">
        <p>The current catalog provides a free plan with a one-time 300-credit welcome grant. Paid web plans provide recurring monthly credits. Subscription-derived credits have a rollover cap equal to two times the plan's monthly allocation. The cap applies to subscription-derived credits, not purchased top-up credits or the welcome grant.</p>
        <p>One-time top-up credits do not expire under the current product behavior. Welcome credits are not currently treated as expiring subscription credits. Credits are account entitlements, have no cash value, and are not transferable unless the operator expressly states otherwise.</p>
        <p>A successful generation reserves credits before provider work and finalizes the charge only after the result is saved. Failed operations release the same reserved bucket. A failed renewal does not create a recurring grant. Cancellation takes effect at the actual billing-period end, and cancellation or a plan change does not currently confiscate purchased top-up or welcome credits.</p>
      </LegalSection>

      <LegalSection title="7. Billing, cancellation, refunds, and disputes">
        <p>Web subscriptions and top-ups are handled through Stripe when enabled. Subscription cancellation is scheduled for the end of the current billing period through the available billing controls. Future iOS purchases, if introduced, may be handled separately by Apple and may have separate Apple terms and refund processes.</p>
        <p>The current implementation records refund and dispute events and does not blindly force a negative credit balance. It does not itself guarantee an automatic refund. Refund eligibility, time windows, statutory cancellation rights, and any treatment of credits after a refund or dispute must be finalized in the Refund &amp; Billing Policy before paid launch.</p>
      </LegalSection>

      <LegalSection title="8. Service changes and availability">
        <p>SAVI may change models, tools, limits, provider integrations, catalog items, or interface details. We may pause or discontinue a feature where needed for security, provider, legal, or operational reasons. No absolute uptime or uninterrupted access is promised.</p>
      </LegalSection>

      <LegalSection title="9. Suspension and termination">
        <p>We may restrict or suspend use for suspected abuse, unauthorized access, non-payment, legal requirements, or risks to the service. You may stop using SAVI at any time. The operator must finalize the account-closure, data-deletion, and unused-credit treatment that applies after termination, subject to applicable law.</p>
      </LegalSection>

      <LegalSection title="10. Disclaimers and liability">
        <p>To the extent permitted by law, SAVI is provided without promises that every output, feature, provider, or stored asset will be available, uninterrupted, accurate, or error-free. Nothing in these terms limits rights or remedies that cannot lawfully be limited. Any final liability wording and governing-law provision require professional legal review before launch.</p>
      </LegalSection>

      <LegalSection title="11. Contact and changes">
        <p>Questions about these terms should be sent to {legal.contactEmail}. The operator should publish a new effective date and an appropriate notice when material terms change.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
