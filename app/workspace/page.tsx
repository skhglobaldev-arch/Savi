'use client';

import { useEffect, useRef, useState } from 'react';
import { AskSaviChat } from '@/components/AskSaviChat';
import { AllTools } from '@/components/AllTools';
import { AllMediaLibrary } from '@/components/AllMediaLibrary';
import { CreditBadge } from '@/components/CreditBadge';
import { ArrowLeftIcon } from '@/components/SaviIcons';
import { SaviSidebar, type SidebarMode } from '@/components/SaviSidebar';
import { FileToolsStudio } from '@/components/file-tools/FileToolsStudio';
import { ImageToolsStudio } from '@/components/image-tools/ImageToolsStudio';
import { VideoToolsStudio } from '@/components/video-tools/VideoToolsStudio';
import { VoiceToolsStudio } from '@/components/voice-tools/VoiceToolsStudio';
import type { ToolMode } from '@/components/ToolModeSelector';
import { useAuthoritativeCredits } from '@/lib/savi/useAuthoritativeCredits';
import { templates, type TemplateItem } from '@/lib/templates';

function getModeForTemplate(item: TemplateItem): ToolMode {
  if (['pdf-to-podcast', 'summarize-contract', 'explain-document', 'translate-pdf'].includes(item.id)) return 'Files';
  if (['instagram-from-image', 'product-photo-prompt'].includes(item.id)) return 'Images';
  if (item.id === 'blog-to-audio') return 'Voice';
  return 'Ask AI';
}

export default function WorkspacePage() {
  const initialRouteHandled = useRef(false);
  const { credits, refresh: refreshCredits } = useAuthoritativeCredits();
  const [mode, setMode] = useState<SidebarMode>('Ask AI');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | undefined>();
  const [templateLaunchKey, setTemplateLaunchKey] = useState(0);
  const [initialAskMessage, setInitialAskMessage] = useState('');
  const [initialAskLaunchKey, setInitialAskLaunchKey] = useState(0);
  const [newChatLaunchKey, setNewChatLaunchKey] = useState(0);

  function handleCreditChange(_clientValue: number) {
    void refreshCredits();
  }

  useEffect(() => {
    if (initialRouteHandled.current || typeof window === 'undefined') return;
    initialRouteHandled.current = true;

    const params = new URLSearchParams(window.location.search);
    const message = params.get('message');
    const templateId = params.get('template');
    const tool = params.get('tool');
    const view = params.get('view');

    if (view === 'media') {
      openToolTab('All Media');
      return;
    }

    if (view === 'tools') {
      openToolTab('All Tools');
      return;
    }

    if (message?.trim()) {
      setInitialAskMessage(message.trim());
      setInitialAskLaunchKey((current) => current + 1);
      openToolTab('Ask AI');
      return;
    }

    if (templateId) {
      const template = templates.find((item) => item.id === templateId);
      if (template) {
        useTemplate(template);
        return;
      }
    }

    if (tool && ['Files', 'Images', 'Voice', 'Video'].includes(tool)) {
      openToolTab(tool as ToolMode);
    }
  }, []);

  function useTemplate(item: TemplateItem) {
    setSelectedTemplate(item);
    openToolTab(getModeForTemplate(item), item);
    setTemplateLaunchKey((current) => current + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openToolTab(nextMode: SidebarMode, template?: TemplateItem) {
    if (template) setSelectedTemplate(template);
    else setSelectedTemplate(undefined);
    setMode(nextMode);

    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('view');
      if (nextMode === 'All Media') {
        nextUrl.searchParams.delete('tool');
        nextUrl.searchParams.set('view', 'media');
      } else if (nextMode === 'All Tools') {
        nextUrl.searchParams.delete('tool');
        nextUrl.searchParams.set('view', 'tools');
      } else if (nextMode === 'Ask AI') {
        nextUrl.searchParams.delete('tool');
      } else {
        nextUrl.searchParams.set('tool', nextMode);
      }
      nextUrl.searchParams.delete('message');
      window.history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

  function backToWorkspace() {
    setSelectedTemplate(undefined);
    setMode('Ask AI');

    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('tool');
      nextUrl.searchParams.delete('template');
      nextUrl.searchParams.delete('view');
      window.history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

  function handleSidebarMode(nextMode: SidebarMode) {
    if (nextMode === 'Ask AI' && mode !== 'Ask AI') {
      setNewChatLaunchKey((current) => current + 1);
    }
    openToolTab(nextMode);
    if (nextMode === 'Ask AI') setSelectedTemplate(undefined);
  }

  function renderStudio(tabMode: SidebarMode) {
    const studioProps = {
      credits,
      onCreditsChange: handleCreditChange,
      template: selectedTemplate,
      templateLaunchKey
    };

    if (tabMode === 'All Media') return <AllMediaLibrary />;
    if (tabMode === 'All Tools') return <AllTools onOpenTool={openToolTab} />;
    if (tabMode === 'Files') return <FileToolsStudio {...studioProps} />;
    if (tabMode === 'Images') return <ImageToolsStudio {...studioProps} />;
    if (tabMode === 'Voice') return <VoiceToolsStudio {...studioProps} />;
    if (tabMode === 'Video') return <VideoToolsStudio {...studioProps} />;
    return null;
  }

  if (mode !== 'Ask AI') {
    const returnToToolList = () => {
      if (mode === 'All Media') {
        backToWorkspace();
        return;
      }
      openToolTab('All Tools');
    };

    return (
      <main className="savi-app-home h-screen overflow-hidden bg-black text-white">
        <SaviSidebar active={mode} onOpenMode={handleSidebarMode} credits={credits} />
        <section className="savi-content-shell savi-mobile-tool-offset flex h-screen min-h-0 flex-col overflow-hidden px-3 pb-3 sm:px-4 lg:px-5 lg:py-4">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col gap-3">
            {mode !== 'All Tools' && (
              <div className="flex shrink-0 items-center justify-between gap-3 px-1 py-1">
                <button
                  type="button"
                  onClick={returnToToolList}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/72 transition hover:border-white/25 hover:bg-white/12 hover:text-white"
                  aria-label={mode === 'All Media' ? 'Back to workspace' : 'Back to all tools'}
                >
                  <ArrowLeftIcon />
                  <span>{mode === 'All Media' ? 'Workspace' : 'All tools'}</span>
                </button>
                <CreditBadge credits={credits} />
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent]">
              {renderStudio(mode)}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="savi-app-home h-screen overflow-hidden bg-black text-white">
      <SaviSidebar active={mode} onOpenMode={handleSidebarMode} credits={credits} />

      <section className="savi-content-shell savi-mobile-content-offset relative h-screen overflow-hidden lg:pt-0">
        <AskSaviChat
          credits={credits}
          onCreditsChange={handleCreditChange}
          onOpenTool={openToolTab}
          template={selectedTemplate}
          templateLaunchKey={templateLaunchKey}
          initialMessage={initialAskMessage}
          initialMessageLaunchKey={initialAskLaunchKey}
          newChatLaunchKey={newChatLaunchKey}
        />
      </section>
    </main>
  );
}
