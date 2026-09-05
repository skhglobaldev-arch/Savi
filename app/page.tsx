'use client';

import { useState } from 'react';
import { AskSaviChat } from '@/components/AskSaviChat';
import { SaviSidebar, type SidebarMode } from '@/components/SaviSidebar';
import { SaviAccountButton } from '@/components/SaviAccountButton';
import type { TemplateItem } from '@/lib/templates';

export default function HomePage() {
  const [credits, setCredits] = useState(20000);

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
      <section className="savi-content-shell relative h-screen overflow-hidden pt-[62px] lg:pt-0">
        <SaviAccountButton credits={credits} className="absolute right-4 top-[74px] z-30 lg:right-6 lg:top-5" />
        <AskSaviChat credits={credits} onCreditsChange={setCredits} onOpenTool={openTool} />
      </section>
    </main>
  );
}
