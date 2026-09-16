'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRightIcon, SearchIcon, ToolFileIcon, ToolImageIcon, ToolboxIcon, ToolVideoIcon, ToolVoiceIcon } from '@/components/SaviIcons';
import { ToolPreview } from '@/components/ToolPreview';
import { imageTools } from '@/components/image-tools/ImageToolsStudio';
import { videoTools } from '@/components/video-tools/VideoToolsStudio';
import { voiceToolOptions } from '@/components/voice-tools/VoiceToolsStudio';
import { fileTools } from '@/components/file-tools/FileToolsStudio';
import type { SidebarMode } from '@/components/SaviSidebar';

type ToolCategory = 'All' | 'Images' | 'Video' | 'Voice' | 'Files';

type ToolGroup = {
  mode: Exclude<SidebarMode, 'Ask AI' | 'All Media' | 'All Tools'>;
  title: string;
  icon: ReactNode;
};

export type SaviToolGalleryItem = {
  id: string;
  name: string;
  description: string;
  category: Exclude<ToolCategory, 'All'>;
  mode: ToolGroup['mode'];
  icon: ReactNode;
  previewId: string;
};

const toolGroups: ToolGroup[] = [
  {
    mode: 'Images',
    title: 'Images',
    icon: <ToolImageIcon />
  },
  {
    mode: 'Video',
    title: 'Videos',
    icon: <ToolVideoIcon />
  },
  {
    mode: 'Voice',
    title: 'Voice',
    icon: <ToolVoiceIcon />
  },
  {
    mode: 'Files',
    title: 'Files',
    icon: <ToolFileIcon />
  }
];

const groupByMode = Object.fromEntries(toolGroups.map((group) => [group.mode, group])) as Record<ToolGroup['mode'], ToolGroup>;

export const saviToolGallery: SaviToolGalleryItem[] = [
  ...imageTools.map((tool) => ({ ...tool, name: tool.title, category: 'Images' as const, mode: 'Images' as const, icon: groupByMode.Images.icon, previewId: tool.id })),
  ...videoTools.map((tool) => ({ ...tool, name: tool.title, category: 'Video' as const, mode: 'Video' as const, icon: groupByMode.Video.icon, previewId: tool.id })),
  ...voiceToolOptions.map((tool) => ({ id: tool.id, name: tool.label, description: tool.note, category: 'Voice' as const, mode: 'Voice' as const, icon: groupByMode.Voice.icon, previewId: tool.previewId })),
  ...fileTools
    .filter((tool) => tool.available !== false)
    .map((tool) => ({ ...tool, name: tool.title, category: 'Files' as const, mode: 'Files' as const, icon: groupByMode.Files.icon, previewId: tool.id }))
];

const categories: ToolCategory[] = ['All', 'Images', 'Video', 'Voice', 'Files'];

export function AllTools({ onOpenTool }: { onOpenTool: (mode: SidebarMode, toolId?: string) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ToolCategory>('All');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingTools = useMemo(() => saviToolGallery.filter((tool) => {
    const matchesCategory = category === 'All' || tool.category === category;
    const matchesQuery = !normalizedQuery || `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(normalizedQuery);
    return matchesCategory && matchesQuery;
  }), [category, normalizedQuery]);

  return (
    <section className="savi-tool-shell min-h-full bg-[var(--savi-bg-subtle)]">
      <header className="border-b border-white/10 px-5 py-6 md:px-7 md:py-8">
        <div className="flex max-w-3xl items-start gap-3">
          <span className="savi-tool-mark text-violet-200" aria-hidden="true"><ToolboxIcon /></span>
          <div className="min-w-0">
            <p className="savi-tool-eyebrow">SAVI workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">All Tools</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">A focused workspace for every way you create, edit, and organise.</p>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-5 md:p-7">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full max-w-xl">
            <span className="sr-only">Search tools</span>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/40" aria-hidden="true"><SearchIcon /></span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="savi-control pl-10" placeholder="Search tools" type="search" />
          </label>
          <p className="shrink-0 text-sm text-white/45" aria-live="polite">{matchingTools.length} {matchingTools.length === 1 ? 'tool' : 'tools'}</p>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Filter tools by category">
          {categories.map((item) => {
            const isActive = category === item;
            return (
              <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={isActive} className={`savi-chip min-h-[36px] px-3 transition ${isActive ? 'savi-badge-accent border-violet-300/45 bg-violet-500/15 text-violet-100' : 'hover:border-white/20 hover:bg-white/[0.07] hover:text-white'}`}>
                {item}
              </button>
            );
          })}
        </div>

        {matchingTools.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="SAVI tools">
            {matchingTools.map((tool) => (
            <button key={`${tool.mode}-${tool.id}`} type="button" onClick={() => onOpenTool(tool.mode, tool.id)} className="savi-card savi-card-interactive group flex min-h-[264px] flex-col overflow-hidden p-0 text-left focus-visible:outline-offset-2">
                <div className="relative w-full border-b border-white/10 bg-black/20">
                  <ToolPreview previewId={tool.previewId} compact interactive />
                  <span className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-black/55 text-violet-100 backdrop-blur-sm" aria-hidden="true">{tool.icon}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="savi-card-title text-white">{tool.name}</h2>
                    <span className="savi-badge shrink-0 text-white/55">{tool.category}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/55">{tool.description}</p>
                  <span className="mt-4 flex items-center gap-1 text-xs font-semibold text-violet-200/85">
                    Open <span className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true"><ArrowUpRightIcon /></span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="savi-empty-state min-h-[200px]">
            <div>
              <p className="font-semibold text-white">No matching tools</p>
              <p className="mt-2">Try a different search or category.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
