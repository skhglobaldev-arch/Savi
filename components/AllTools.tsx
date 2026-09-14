'use client';

import type { ReactNode } from 'react';
import { ToolFileIcon, ToolImageIcon, ToolboxIcon, ToolVideoIcon, ToolVoiceIcon } from '@/components/SaviIcons';
import { imageTools } from '@/components/image-tools/ImageToolsStudio';
import { videoTools } from '@/components/video-tools/VideoToolsStudio';
import { voiceToolOptions } from '@/components/voice-tools/VoiceToolsStudio';
import { fileTools } from '@/components/file-tools/FileToolsStudio';
import type { SidebarMode } from '@/components/SaviSidebar';

type ToolGroup = {
  mode: Exclude<SidebarMode, 'Ask AI' | 'All Media' | 'All Tools'>;
  title: string;
  description: string;
  icon: ReactNode;
  tools: string[];
};

const toolGroups: ToolGroup[] = [
  {
    mode: 'Images',
    title: 'Images',
    description: 'Create, edit, and prepare images for real work.',
    icon: <ToolImageIcon />,
    tools: imageTools.map((tool) => tool.title)
  },
  {
    mode: 'Video',
    title: 'Videos',
    description: 'Make clips, story sequences, product ads, and reels.',
    icon: <ToolVideoIcon />,
    tools: videoTools.map((tool) => tool.title)
  },
  {
    mode: 'Voice',
    title: 'Voice',
    description: 'Turn exact text or a topic into a finished voice output.',
    icon: <ToolVoiceIcon />,
    tools: voiceToolOptions.map((tool) => tool.label)
  },
  {
    mode: 'Files',
    title: 'Files',
    description: 'Organise PDFs, export pages, and understand documents.',
    icon: <ToolFileIcon />,
    tools: fileTools.filter((tool) => tool.available !== false).map((tool) => tool.title)
  }
];

export function AllTools({ onOpenTool }: { onOpenTool: (mode: SidebarMode) => void }) {
  return (
    <section className="savi-tool-shell min-h-full">
      <header className="border-b border-white/10 bg-white/[0.035] p-5 md:p-7">
        <div className="flex items-start gap-3">
          <span className="savi-tool-mark text-violet-100" aria-hidden="true"><ToolboxIcon /></span>
          <div className="min-w-0">
            <p className="savi-tool-eyebrow">SAVI workspace</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-white md:text-3xl">All Tools</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Choose a focused workspace for the thing you want to make.</p>
          </div>
        </div>
      </header>

      <div className="space-y-8 p-5 md:p-7">
        {toolGroups.map((group) => (
          <section key={group.mode} aria-labelledby={`all-tools-${group.mode}`}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.055] text-white/78" aria-hidden="true">{group.icon}</span>
                <div className="min-w-0">
                  <h2 id={`all-tools-${group.mode}`} className="text-lg font-semibold text-white">{group.title}</h2>
                  <p className="mt-1 text-sm text-white/45">{group.description}</p>
                </div>
              </div>
              <button type="button" onClick={() => onOpenTool(group.mode)} className="inline-flex min-h-[44px] items-center rounded-lg border border-white/12 bg-white/[0.06] px-4 py-2 text-xs font-bold text-white/72 transition hover:border-white/25 hover:bg-white/12 hover:text-white">
                Open {group.title}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" aria-label={`${group.title} tools`}>
              {group.tools.map((tool) => (
                <span key={tool} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-white/58">{tool}</span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
