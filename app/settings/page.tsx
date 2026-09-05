import { SaviSidebar } from '@/components/SaviSidebar';

export default function SettingsPage() {
  return (
    <main className="savi-app-home min-h-screen bg-black text-white">
      <SaviSidebar active="Settings" credits={20000} />
      <section className="savi-content-shell mx-auto max-w-4xl px-5 py-24 lg:py-12">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200/75">Settings</p>
        <h1 className="mt-4 text-5xl font-black">Project setup</h1>
        <div className="glass mt-8 rounded-[34px] p-6">
          <h2 className="text-2xl font-black">Future integrations</h2>
          <div className="mt-5 space-y-4 text-white/65">
            <p>TODO: Firebase Auth and user profile.</p>
            <p>TODO: Firestore usage logs and credit balance.</p>
            <p>TODO: Gemini API server route.</p>
            <p>TODO: iLovePDF API wrapper.</p>
            <p>TODO: Stripe checkout and webhooks.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
