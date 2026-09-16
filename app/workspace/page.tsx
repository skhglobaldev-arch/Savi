'use client';

import { useEffect, useRef, useState } from 'react';
import { AskSaviChat } from '@/components/AskSaviChat';
import { AllTools } from '@/components/AllTools';
import { AllMediaLibrary } from '@/components/AllMediaLibrary';
import { SaviAppShell, SaviTopBar } from '@/components/SaviAppShell';
import { ArrowLeftIcon } from '@/components/SaviIcons';
import type { SidebarMode } from '@/components/SaviSidebar';
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
  const [toolLaunchId, setToolLaunchId] = useState('');
  const [toolLaunchKey, setToolLaunchKey] = useState(0);

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
    const toolId = params.get('toolId');
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
      openToolTab(tool as ToolMode, undefined, toolId ?? undefined);
    }
  }, []);

  function useTemplate(item: TemplateItem) {
    setSelectedTemplate(item);
    openToolTab(getModeForTemplate(item), item);
    setTemplateLaunchKey((current) => current + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openToolTab(nextMode: SidebarMode, template?: TemplateItem, nextToolId?: string) {
    if (template) setSelectedTemplate(template);
    else setSelectedTemplate(undefined);
    setToolLaunchId(nextToolId ?? '');
    if (nextToolId) setToolLaunchKey((current) => current + 1);
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
      if (nextToolId) nextUrl.searchParams.set('toolId', nextToolId);
      else nextUrl.searchParams.delete('toolId');
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
    if (tabMode === 'All Tools') return <AllTools onOpenTool={(nextMode, nextToolId) => openToolTab(nextMode, undefined, nextToolId)} />;
    if (tabMode === 'Files') return <FileToolsStudio {...studioProps} launchToolId={toolLaunchId} launchKey={toolLaunchKey} />;
    if (tabMode === 'Images') return <ImageToolsStudio {...studioProps} launchToolId={toolLaunchId} launchKey={toolLaunchKey} />;
    if (tabMode === 'Voice') return <VoiceToolsStudio {...studioProps} launchToolId={toolLaunchId} launchKey={toolLaunchKey} />;
    if (tabMode === 'Video') return <VideoToolsStudio {...studioProps} launchToolId={toolLaunchId} launchKey={toolLaunchKey} />;
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
      <SaviAppShell
        active={mode}
        onOpenMode={handleSidebarMode}
        credits={credits}
        viewport="screen"
        contentClassName="savi-mobile-content-offset flex min-h-0 flex-col"
      >
        <SaviTopBar
          title={getWorkspaceTitle(mode)}
          showOnMobile={mode !== 'All Tools'}
          leading={mode !== 'All Tools' ? (
            <button
              type="button"
              onClick={returnToToolList}
              className="savi-button savi-button-ghost px-2.5"
              aria-label={mode === 'All Media' ? 'Back to workspace' : 'Back to all tools'}
            >
              <ArrowLeftIcon />
              <span>{mode === 'All Media' ? 'Workspace' : 'All tools'}</span>
            </button>
          ) : undefined}
        />
        <div className="min-h-0 flex-1 px-3 pb-3 pt-3 sm:px-4 lg:px-5">
          <div className="mx-auto h-full min-h-0 w-full max-w-[1500px] overflow-y-auto overscroll-contain pb-5 pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent]">
            {renderStudio(mode)}
          </div>
        </div>
      </SaviAppShell>
    );
  }

  return (
    <SaviAppShell
      active={mode}
      onOpenMode={handleSidebarMode}
      credits={credits}
      viewport="screen"
      contentClassName="savi-mobile-content-offset relative lg:pt-0"
    >
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
    </SaviAppShell>
  );
}

function getWorkspaceTitle(mode: SidebarMode): string {
  if (mode === 'All Media') return 'Library';
  if (mode === 'All Tools') return 'All Tools';
  if (mode === 'Ask AI') return 'Ask SAVI';
  return mode === 'Video' ? 'Videos' : mode;
}
