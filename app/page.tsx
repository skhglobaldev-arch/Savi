'use client';

import { AskSaviChat } from '@/components/AskSaviChat';
import { SaviSidebar, type SidebarMode } from '@/components/SaviSidebar';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';
import type { TemplateItem } from '@/lib/templates';

export default function HomePage() {
  const { credits, refresh: refreshCredits } = useAuthoritativeCredits();

  function handleCreditChange(_clientValue: number) {
    void refreshCredits();
  }

  function openTool(mode: SidebarMode, template?: TemplateItem) {
    const url = new URL('/workspace', window.location.origin);
    if (mode === 'All Media') {
      url.searchParams.set('view', 'media');
    } else if (mode !== 'Ask AI') {
      url.searchParams.set('tool', mode);
    }
    if (template?.id) url.searchParams.set('template', template.id);
    window.location.href = url.toString();
  }

  return (
    <main className="savi-app-home h-screen overflow-hidden bg-black text-white">
      <SaviSidebar active="Ask AI" onOpenMode={openTool} credits={credits} />
      <section className="savi-content-shell savi-mobile-content-offset relative h-screen overflow-hidden lg:pt-0">
        <AskSaviChat credits={credits ?? 0} onCreditsChange={handleCreditChange} onOpenTool={openTool} />
      </section>
    </main>
  );
}
