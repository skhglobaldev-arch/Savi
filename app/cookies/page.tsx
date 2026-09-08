import type { Metadata } from 'next';
import { LegalPageShell, LegalSection, LegalList } from '@/components/LegalPageShell';

export const metadata: Metadata = { title: 'Cookie Policy · SAVI' };
export const dynamic = 'force-dynamic';

export default function CookiesPage() {
  return (
    <LegalPageShell
      eyebrow="Cookies"
      title="Cookie Policy"
      description="SAVI currently uses cookies that are necessary for sign-in and the Google OAuth flow. It does not currently use analytics or marketing cookies."
    >
      <LegalSection title="1. Necessary authentication cookies">
        <p><strong className="text-white">savi_session.</strong> A signed, HTTP-only session cookie used to keep you signed in to SAVI. It is configured for same-site use, is marked secure in production, and currently has a 30-day lifetime unless you sign out earlier.</p>
        <p><strong className="text-white">savi_google_oauth_state.</strong> A short-lived, HTTP-only cookie used to compare the OAuth callback state and reduce request-forgery risk. It currently lasts up to 10 minutes.</p>
        <p><strong className="text-white">savi_google_return_to.</strong> A short-lived, HTTP-only cookie that remembers a safe in-app return path during Google sign-in. It currently lasts up to 10 minutes.</p>
      </LegalSection>

      <LegalSection title="2. What SAVI does not currently use">
        <LegalList items={[
          'No analytics cookies are currently implemented.',
          'No advertising or marketing cookies are currently implemented.',
          'No non-essential cookie consent banner is currently implemented. The operator must confirm the PECR classification of the persistent session cookie before launch and add consent if it is not strictly necessary.'
        ]} />
        <p>The browser also uses local storage for chat history, saved outputs, media-library references, and interface preferences, and session storage for short-lived request coordination. These are browser storage mechanisms rather than cookies, but you can remove them through browser controls.</p>
      </LegalSection>

      <LegalSection title="3. Your choices">
        <p>You can delete cookies through your browser settings, sign out to clear the SAVI session, or block cookies. Blocking necessary cookies will prevent sign-in and may prevent protected tools from working.</p>
        <p>If SAVI adds analytics, advertising, personalization, or other non-essential tracking, the operator must reassess PECR requirements and add an appropriate consent choice before enabling it.</p>
      </LegalSection>

      <LegalSection title="4. Changes and contact">
        <p>Cookie names, lifetimes, and purposes may change when the authentication or product architecture changes. The operator should update this policy and its effective date before introducing any non-essential tracking.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
