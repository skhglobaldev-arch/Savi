import type { ReactNode } from 'react';

function IconShell({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function ToolImageIcon() {
  return <IconShell><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M5 16l4-4 3 3 2-2 5 4" /></IconShell>;
}

export function ToolVideoIcon() {
  return <IconShell><rect x="3.5" y="6" width="13" height="12" rx="2" /><path d="M16.5 10l4-2.5v9l-4-2.5" /><path d="M7 9.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" /></IconShell>;
}

export function ToolVoiceIcon() {
  return <IconShell><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7" /></IconShell>;
}

export function ToolFileIcon() {
  return <IconShell><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v5h4M9 13h6M9 16.5h4" /></IconShell>;
}

export function ToolboxIcon() {
  return <IconShell><path d="M4 8.5h16v10H4z" /><path d="M8 8.5v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12.5h16M10 12.5v2h4v-2" /></IconShell>;
}

export function ArrowLeftIcon() {
  return <IconShell><path d="M19 12H5M11 6l-6 6 6 6" /></IconShell>;
}
