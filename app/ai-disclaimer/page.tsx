import type { Metadata } from 'next';
import { LegalPageShell, LegalSection, LegalList } from '@/components/LegalPageShell';

export const metadata: Metadata = { title: 'AI Usage and Output Disclaimer · SAVI' };
export const dynamic = 'force-dynamic';

export default function AiDisclaimerPage() {
  return (
    <LegalPageShell
      eyebrow="AI use"
      title="AI Usage and Output Disclaimer"
      description="SAVI helps you explore ideas and create working drafts. Review every result before relying on it or sharing it."
    >
      <LegalSection title="1. Outputs can be wrong">
        <LegalList items={[
          'AI outputs may be inaccurate, incomplete, outdated, biased, or unsuitable for your context.',
          'A confident-sounding answer is not proof that the answer is correct.',
          'Generated images, video, voice, and documents may contain artifacts, omissions, transcription errors, or other defects.',
          'You should verify important facts, calculations, citations, instructions, and representations independently.'
        ]} />
      </LegalSection>

      <LegalSection title="2. Not professional advice">
        <p>SAVI is not a lawyer, doctor, financial adviser, therapist, safety professional, or other regulated adviser. Do not use SAVI output as a substitute for qualified professional advice, emergency assistance, or a required review by a responsible person.</p>
      </LegalSection>

      <LegalSection title="3. Your responsibility">
        <p>You remain responsible for the prompts, files, references, decisions, and actions connected with your use of SAVI. Check that you have permission to upload or transform content, and check generated material for privacy, accuracy, safety, accessibility, and third-party rights before use.</p>
      </LegalSection>

      <LegalSection title="4. Provider processing">
        <p>To provide AI features, SAVI may send the content needed for the requested operation to Google Gemini or another provider identified by the active product configuration. Do not submit confidential, regulated, or sensitive information unless you have assessed that use and have the necessary authority.</p>
      </LegalSection>

      <LegalSection title="5. No outcome guarantee">
        <p>SAVI does not guarantee that an output will be unique, error-free, non-infringing, or fit for a particular purpose. The service is a tool for assisted work, not a replacement for human judgment.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
