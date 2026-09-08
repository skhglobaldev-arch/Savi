import type { Metadata } from 'next';
import { LegalPageShell, LegalSection, LegalList } from '@/components/LegalPageShell';
import { getLegalConfiguration } from '@/lib/legal/config';

export const metadata: Metadata = { title: 'Privacy Policy · SAVI' };
export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  const legal = getLegalConfiguration();

  return (
    <LegalPageShell
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy describes the information SAVI handles when you use the AI workspace, its generation tools, private assets, and web billing. It is written from the current implementation and identifies areas that must be finalized before launch."
    >
      <LegalSection title="1. Who operates SAVI">
        <p>SAVI is operated by {legal.operatorName}. The privacy contact is {legal.contactEmail}. The business address is {legal.businessAddress}.</p>
        <p>This policy is effective from {legal.effectiveDate}. Replace the configuration placeholders before publishing the service.</p>
      </LegalSection>

      <LegalSection title="2. Information we handle">
        <p><strong className="text-white">Account and identity.</strong> When you sign in with Google, SAVI receives the identity information needed to authenticate you, including a Google subject identifier, email address, display name, and optional profile image. SAVI creates its own signed session; it does not receive or store your Google password.</p>
        <p><strong className="text-white">Prompts and content.</strong> SAVI handles prompts, instructions, reference images, audio, video, and uploaded PDFs when you submit them to a tool. Depending on the tool, this content is sent to Google Gemini to provide the requested response or generation. Do not submit information you are not authorized to use.</p>
        <p><strong className="text-white">Generated media and documents.</strong> Completed outputs can be stored as private account assets. The current asset route checks the signed account session and the owning account before serving an asset.</p>
        <p><strong className="text-white">Usage and security data.</strong> SAVI stores account, generation-job, credit, usage, failure, and rate-limit records needed to operate the service. Rate-limit keys are derived from authenticated user identifiers or, only when a trusted proxy is explicitly configured, a one-way hash of a validated proxy address. Operational logs are intended to contain event categories and bounded metadata, not prompts, raw files, cookies, tokens, or provider keys.</p>
        <p><strong className="text-white">Billing information.</strong> Web billing is designed to use Stripe. SAVI stores billing metadata such as Stripe customer, subscription, purchase, payment-event, catalog, currency, amount, and credit-grant records. Card numbers and full payment credentials are handled by Stripe rather than stored in SAVI application records.</p>
        <p><strong className="text-white">Browser storage.</strong> The web client currently uses local storage for chat history, saved outputs, media-library references, and interface preferences. It uses session storage for short-lived request coordination. This browser storage is separate from SAVI's server database and can remain on a device until cleared by the browser or the product's local cleanup controls.</p>
      </LegalSection>

      <LegalSection title="3. How we use information">
        <LegalList items={[
          'authenticate accounts and maintain signed sessions;',
          'provide chat, text, image, video, voice, and file/PDF tools;',
          'send requested content to the relevant AI provider and return the result;',
          'store and serve private generated assets for the owning account;',
          'quote and charge credits, prevent duplicate operations, and maintain credit provenance;',
          'process subscriptions, top-ups, cancellations, webhook events, refunds, and disputes through the configured billing provider;',
          'protect the service against abusive traffic, fraud, unauthorized access, and infrastructure failures; and',
          'diagnose failures and improve reliability using operational metadata.'
        ]} />
      </LegalSection>

      <LegalSection title="4. Service providers and international processing">
        <p>Current integrations include Google OAuth, Google Gemini, Firebase Admin and Data Connect/Cloud SQL, private Firebase Storage or Google Cloud Storage, Firestore for server-side rate limiting, and Stripe for web billing when enabled. These providers process information under their own terms and privacy documentation as applicable.</p>
        <p>Provider processing locations and transfer arrangements are not fully configured by this repository. Before a UK launch, the operator must verify provider contracts, data-processing terms, international-transfer safeguards, and the correct privacy disclosures for the selected accounts and regions.</p>
      </LegalSection>

      <LegalSection title="5. Cookies and similar storage">
        <p>SAVI currently uses strictly necessary HTTP cookies for authentication and the Google OAuth flow. It does not currently implement analytics or marketing cookies. The separate Cookie Policy explains the cookie names, purposes, and lifetimes.</p>
      </LegalSection>

      <LegalSection title="6. Retention, deletion, and account requests">
        <p>The current implementation does not define a universal retention schedule, automated deletion job, or self-serve account deletion control. Generated assets, account records, usage records, billing records, and provider-held data may therefore remain until an operational deletion process is applied.</p>
        <p>Before launch, the operator must approve retention periods, deletion workflows, backup handling, provider deletion requests, and the process for access, correction, restriction, objection, portability, and deletion requests. Contact {legal.contactEmail} for requests once that contact is configured.</p>
      </LegalSection>

      <LegalSection title="7. Children">
        <p>SAVI is not presented as a service for children. The operator must finalize the minimum-age approach, UK/EEA child-data handling, and any parental-consent process before launch. Do not submit a child's information unless you have a lawful basis and authorization to do so.</p>
      </LegalSection>

      <LegalSection title="8. Security limits">
        <p>SAVI uses signed sessions, server-only access to Data Connect operations, a private asset bucket, owner-scoped asset queries, and bounded operational logging. No online service is risk-free, and these measures are not a guarantee of security or uninterrupted availability. Keep your Google account secure and tell the operator promptly about suspected unauthorized access.</p>
      </LegalSection>

      <LegalSection title="9. Changes and contact">
        <p>This policy may be updated when the service, providers, or legal requirements change. The operator should publish the effective date and a suitable notice for material changes. Questions or privacy requests should be sent to {legal.contactEmail}.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
