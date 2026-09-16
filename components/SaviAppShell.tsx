'use client';

import type { ReactNode } from 'react';
import { SaviSidebar, type SidebarActive, type SidebarMode } from './SaviSidebar';

export function SaviAppShell({
  active,
  credits,
  onOpenMode,
  children,
  viewport = 'page',
  contentClassName = ''
}: {
  active: SidebarActive;
  credits?: number | null;
  onOpenMode?: (mode: SidebarMode) => void;
  children: ReactNode;
  viewport?: 'page' | 'screen';
  contentClassName?: string;
}) {
  const viewportClass = viewport === 'screen'
    ? 'h-screen overflow-hidden'
    : 'min-h-screen';

  return (
    <main className={`savi-app-shell savi-app-home ${viewportClass} text-white`}>
      <SaviSidebar active={active} onOpenMode={onOpenMode} credits={credits} />
      <section className={`savi-content-shell ${viewportClass} ${contentClassName}`}>
        {children}
      </section>
    </main>
  );
}

export function SaviTopBar({
  title,
  leading,
  trailing,
  showOnMobile = false
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  showOnMobile?: boolean;
}) {
  return (
    <header className={`savi-topbar${showOnMobile ? ' savi-topbar-mobile' : ''}`}>
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <span className="truncate text-sm font-semibold text-[var(--savi-text-primary)]">{title}</span>
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </header>
  );
}

export function SaviPageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="savi-page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="savi-eyebrow">{eyebrow}</p> : null}
        <h1 className="savi-page-title">{title}</h1>
        {description ? <p className="savi-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
