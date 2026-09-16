'use client';

import { AskSaviChat } from '@/components/AskSaviChat';
import { SaviAppShell } from '@/components/SaviAppShell';
import type { SidebarMode } from '@/components/SaviSidebar';
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
    } else if (mode === 'All Tools') {
      url.searchParams.set('view', 'tools');
    } else if (mode !== 'Ask AI') {
      url.searchParams.set('tool', mode);
    }
    if (template?.id) url.searchParams.set('template', template.id);
    window.location.href = url.toString();
  }

  return (
    <SaviAppShell
      active="Ask AI"
      onOpenMode={openTool}
      credits={credits}
      viewport="screen"
      contentClassName="savi-mobile-content-offset relative lg:pt-0"
    >
      <AskSaviChat credits={credits ?? 0} onCreditsChange={handleCreditChange} onOpenTool={openTool} />
    </SaviAppShell>
  );
}
