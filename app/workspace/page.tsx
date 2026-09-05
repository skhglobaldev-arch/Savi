'use client';

import { useEffect, useRef, useState } from 'react';
import { AskSaviChat } from '@/components/AskSaviChat';
import { AllMediaLibrary } from '@/components/AllMediaLibrary';
import { CreditBadge } from '@/components/CreditBadge';
import { SaviSidebar, type SidebarMode } from '@/components/SaviSidebar';
import { UpgradeModal } from '@/components/UpgradeModal';
import { SaviAccountButton } from '@/components/SaviAccountButton';
import { FileToolsStudio } from '@/components/file-tools/FileToolsStudio';
import { ImageToolsStudio } from '@/components/image-tools/ImageToolsStudio';
import { VideoToolsStudio } from '@/components/video-tools/VideoToolsStudio';
import { VoiceToolsStudio } from '@/components/voice-tools/VoiceToolsStudio';
import type { ToolMode } from '@/components/ToolModeSelector';
import { templates, type TemplateItem } from '@/lib/templates';

const toolNavItems: Array<{ mode: ToolMode; label: string; short: string; hint: string }> = [
  { mode: 'Ask AI', label: 'Ask SAVI', short: 'S', hint: 'Chat' },
  { mode: 'Images', label: 'Images', short: 'I', hint: 'Generate and edit' },
  { mode: 'Video', label: 'Videos', short: 'V', hint: 'Shots and clips' },
  { mode: 'Voice', label: 'Voice', short: 'A', hint: 'Speech and radio' },
  { mode: 'Files', label: 'Files', short: 'F', hint: 'PDF tools' }
];

const CLOSE_ACTIVE_TOOL_EVENT = 'savi-close-active-tool';

function getModeForTemplate(item: TemplateItem): ToolMode {
  if (['pdf-to-podcast', 'summarize-contract', 'explain-document', 'translate-pdf'].includes(item.id)) return 'Files';
  if (['instagram-from-image', 'product-photo-prompt'].includes(item.id)) return 'Images';
  if (item.id === 'blog-to-audio') return 'Voice';
  if (item.id === 'video-ad-script') return 'Video';
  return 'Ask AI';
}

function getTabLabel(mode: ToolMode) {
  return mode === 'Ask AI' ? 'Ask SAVI' : mode;
}

function getWorkspaceLabel(mode: SidebarMode) {
  if (mode === 'All Media') return 'All Media';
  return getTabLabel(mode as ToolMode);
}

export default function WorkspacePage() {
  const initialRouteHandled = useRef(false);
  const [credits, setCredits] = useState(20000);
  const [mode, setMode] = useState<SidebarMode>('Ask AI');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | undefined>();
  const [templateLaunchKey, setTemplateLaunchKey] = useState(0);
  const [initialAskMessage, setInitialAskMessage] = useState('');
  const [initialAskLaunchKey, setInitialAskLaunchKey] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

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
    openToolTab(nextMode);
    if (nextMode === 'Ask AI') setSelectedTemplate(undefined);
  }

  function renderStudio(tabMode: SidebarMode) {
    const studioProps = {
      credits,
      onCreditsChange: setCredits,
      template: selectedTemplate,
      templateLaunchKey
    };

    if (tabMode === 'All Media') return <AllMediaLibrary />;
    if (tabMode === 'Files') return <FileToolsStudio {...studioProps} />;
    if (tabMode === 'Images') return <ImageToolsStudio {...studioProps} />;
    if (tabMode === 'Voice') return <VoiceToolsStudio {...studioProps} />;
    if (tabMode === 'Video') return <VideoToolsStudio {...studioProps} />;
    return null;
  }

  if (mode !== 'Ask AI') {
    const activeTool = toolNavItems.find((item) => item.mode === mode);
    const returnToToolList = () => {
      if (mode === 'All Media') {
        backToWorkspace();
        return;
      }

      window.dispatchEvent(new CustomEvent(CLOSE_ACTIVE_TOOL_EVENT));
    };

    return (
      <main className="savi-app-home h-screen overflow-hidden bg-black text-white">
        <SaviSidebar active={mode} onOpenMode={handleSidebarMode} credits={credits} />
        <section className="savi-content-shell flex h-screen min-h-0 flex-col overflow-hidden px-3 pb-3 pt-[74px] sm:px-4 lg:px-5 lg:py-4">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col gap-3">
            <header className="shrink-0 rounded-[22px] border border-white/10 bg-[#111]/88 px-3 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.32)] backdrop-blur-2xl md:px-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={returnToToolList}
                    className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-bold text-white/72 transition hover:bg-white/14 hover:text-white"
                  >
                    {mode === 'All Media' ? 'Back' : 'Tools'}
                  </button>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">SAVI Tool Window</p>
                    <h1 className="truncate text-xl font-semibold text-white md:text-2xl">{getWorkspaceLabel(mode)}</h1>
                    {activeTool && <p className="mt-0.5 text-xs text-white/42">{activeTool.hint}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <SaviAccountButton credits={credits} />
                  <CreditBadge credits={credits} />
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-5 pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent]">
              {renderStudio(mode)}
            </div>
          </div>
        </section>
        <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
      </main>
    );
  }

  return (
    <main className="savi-app-home h-screen overflow-hidden bg-black text-white">
      <SaviSidebar active={mode} onOpenMode={handleSidebarMode} credits={credits} />

      <section className="savi-content-shell relative h-screen overflow-hidden pt-[62px] lg:pt-0">
        <SaviAccountButton credits={credits} className="absolute right-4 top-[74px] z-30 lg:right-6 lg:top-5" />
        <AskSaviChat
          credits={credits}
          onCreditsChange={setCredits}
          onOpenTool={openToolTab}
          template={selectedTemplate}
          templateLaunchKey={templateLaunchKey}
          initialMessage={initialAskMessage}
          initialMessageLaunchKey={initialAskLaunchKey}
        />
      </section>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </main>
  );
}
