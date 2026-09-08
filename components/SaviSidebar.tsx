'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import type { ToolMode } from './ToolModeSelector';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import { LegalConsentNotice, LegalLinks } from './LegalLinks';

export type SidebarMode = ToolMode | 'All Media';
type SidebarActive = SidebarMode | 'Credits' | 'Settings' | 'Activity';

type SidebarItem = {
  label: string;
  hint?: string;
  mode?: SidebarMode;
  href: string;
  active: SidebarActive;
  icon: ReactNode;
};

type SidebarChatSession = {
  id: string;
  title: string;
  updatedAt: number;
};

const CHAT_SESSIONS_KEY = 'savi.chat.sessions.v1';
const CHAT_SESSIONS_EVENT = 'savi-chat-sessions-updated';
const CHAT_NEW_EVENT = 'savi-new-chat-requested';
const CHAT_OPEN_EVENT = 'savi-open-chat-requested';
const CHAT_DELETE_EVENT = 'savi-chat-deleted';

const toolItems: SidebarItem[] = [
  {
    label: 'Ask SAVI',
    hint: 'Chat',
    mode: 'Ask AI',
    href: '/workspace',
    active: 'Ask AI',
    icon: <SparkIcon />
  },
  {
    label: 'All Media',
    hint: 'Generated outputs',
    mode: 'All Media',
    href: '/workspace?view=media',
    active: 'All Media',
    icon: <GridIcon />
  },
  {
    label: 'Images',
    hint: 'Generate and edit',
    mode: 'Images',
    href: '/workspace?tool=Images',
    active: 'Images',
    icon: <FrameIcon />
  },
  {
    label: 'Videos',
    hint: 'Shots and clips',
    mode: 'Video',
    href: '/workspace?tool=Video',
    active: 'Video',
    icon: <VideoIcon />
  },
  {
    label: 'Voice',
    hint: 'Speech and radio',
    mode: 'Voice',
    href: '/workspace?tool=Voice',
    active: 'Voice',
    icon: <WaveIcon />
  },
  {
    label: 'Files',
    hint: 'PDF tools',
    mode: 'Files',
    href: '/workspace?tool=Files',
    active: 'Files',
    icon: <FileIcon />
  }
];

export function SaviSidebar({
  active = 'Ask AI',
  onOpenMode,
  credits
}: {
  active?: SidebarActive;
  onOpenMode?: (mode: SidebarMode) => void;
  credits?: number | null;
}) {
  const [chatSessions, setChatSessions] = useState<SidebarChatSession[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, isLoading: isAuthLoading, signIn, signOut } = useSaviAuth();

  useEffect(() => {
    function refreshChats() {
      try {
        const value = window.localStorage.getItem(CHAT_SESSIONS_KEY);
        const parsed = value ? (JSON.parse(value) as SidebarChatSession[]) : [];
        setChatSessions(Array.isArray(parsed) ? parsed.slice(0, 6) : []);
      } catch {
        setChatSessions([]);
      }
    }

    refreshChats();
    window.addEventListener(CHAT_SESSIONS_EVENT, refreshChats);
    window.addEventListener('storage', refreshChats);
    return () => {
      window.removeEventListener(CHAT_SESSIONS_EVENT, refreshChats);
      window.removeEventListener('storage', refreshChats);
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('savi.sidebar.collapsed');
    if (stored === '1') setCollapsed(true);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem('savi.sidebar.chatsOpen');
    if (stored === '0') setChatsOpen(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.saviSidebar = collapsed ? 'collapsed' : 'open';
    window.localStorage.setItem('savi.sidebar.collapsed', collapsed ? '1' : '0');
    return () => {
      document.documentElement.dataset.saviSidebar = 'open';
    };
  }, [collapsed]);

  useEffect(() => {
    window.localStorage.setItem('savi.sidebar.chatsOpen', chatsOpen ? '1' : '0');
  }, [chatsOpen]);

  function handleModeClick(event: MouseEvent<HTMLAnchorElement>, mode?: SidebarMode) {
    if (!mode || !onOpenMode) return;
    event.preventDefault();
    if (mode === 'Ask AI') {
      window.history.replaceState(null, '', '/workspace');
      window.dispatchEvent(new CustomEvent(CHAT_NEW_EVENT));
    }
    onOpenMode(mode);
  }

  return (
    <>
      <aside className={`savi-global-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col overflow-visible border-r border-white/[0.08] bg-[#171717]/88 px-2.5 py-3 text-white shadow-[12px_0_34px_rgba(0,0,0,0.24)] backdrop-blur-2xl lg:flex ${collapsed ? 'items-center' : ''}`}>
        <div className={`flex w-full items-center gap-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Link href="/" className={`flex min-w-0 items-center gap-3 rounded-2xl px-1.5 py-1.5 transition hover:bg-white/[0.06] ${collapsed ? 'justify-center' : ''}`} aria-label="SAVI home">
            <img src="/brand/savi-logo.png" alt="SAVI" className="h-9 w-9 rounded-xl object-cover shadow-[0_0_24px_rgba(124,58,237,0.32)]" />
            <span className={`min-w-0 transition ${collapsed ? 'hidden' : 'block'}`}>
              <span className="block truncate text-[16px] font-semibold leading-5 text-white">SAVI</span>
              <span className="block truncate text-[11px] font-medium text-white/42">by SKH.GLOBAL</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/14 text-white/72 transition hover:bg-white/10 hover:text-white"
            aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>

        <div className="mt-6 w-full flex-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent]">
        <nav className="space-y-1.5">
          {toolItems.map((item) => (
            <SidebarLink key={item.label} item={item} active={active === item.active} collapsed={collapsed} onClick={(event) => handleModeClick(event, item.mode)} />
          ))}
        </nav>

        {!collapsed && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setChatsOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/34 transition hover:bg-white/[0.05] hover:text-white/62"
              aria-expanded={chatsOpen}
            >
              <span>Chats</span>
              <span className="text-white/45">{chatsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
            </button>
            {chatsOpen && (
              <div className="mt-2 space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenMode?.('Ask AI');
                    window.history.replaceState(null, '', '/workspace');
                    window.dispatchEvent(new CustomEvent(CHAT_NEW_EVENT));
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[13px] font-semibold text-white/62 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-xl border border-white/10 bg-white/[0.035]"><PlusIcon /></span>
                  New chat
                </button>
                {chatSessions.length ? chatSessions.map((chat) => (
                  <div key={chat.id} className="group flex items-center gap-1 rounded-2xl text-white/62 transition hover:bg-white/[0.06]">
                    <Link
                      href={`/workspace?chat=${encodeURIComponent(chat.id)}`}
                      onClick={(event) => {
                        if (!onOpenMode) return;
                        event.preventDefault();
                        onOpenMode('Ask AI');
                        window.history.replaceState(null, '', `/workspace?chat=${encodeURIComponent(chat.id)}`);
                        window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { chatId: chat.id } }));
                      }}
                      className="min-w-0 flex-1 px-3 py-2.5"
                    >
                      <span className="block truncate text-[13px] font-medium">{chat.title || 'New chat'}</span>
                      <span className="block truncate text-[11px] text-white/34">{new Date(chat.updatedAt).toLocaleDateString()}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const value = window.localStorage.getItem(CHAT_SESSIONS_KEY);
                          const parsed = value ? (JSON.parse(value) as SidebarChatSession[]) : [];
                          window.localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(parsed.filter((item) => item.id !== chat.id)));
                          window.dispatchEvent(new CustomEvent(CHAT_SESSIONS_EVENT));
                          window.dispatchEvent(new CustomEvent(CHAT_DELETE_EVENT, { detail: { chatId: chat.id } }));
                        } catch {
                          // Ignore local sidebar cleanup errors.
                        }
                      }}
                      className="mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs text-white/34 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                      aria-label={`Close ${chat.title || 'chat'}`}
                    >
                      x
                    </button>
                  </div>
                )) : (
                  <p className="px-3 py-2 text-[12px] text-white/30">No chats yet</p>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        <div className="relative mt-3 w-full shrink-0">
          {profileOpen && (
            <div className={`absolute bottom-[calc(100%+10px)] z-50 rounded-[24px] border border-white/10 bg-[#202020]/95 p-2 shadow-[0_22px_60px_rgba(0,0,0,0.38)] backdrop-blur-2xl ${collapsed ? 'left-full ml-3 w-60' : 'left-0 right-0'}`}>
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setProfileOpen(false)}
                    className="mb-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-[13px] font-semibold text-white/58 transition hover:bg-white/8 hover:text-white"
                  >
                    <ChevronLeftIcon />
                    Back
                  </button>
                  <div className="mb-2 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2.5">
                    <p className="truncate text-[13px] font-semibold text-white">{user.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-white/38">{user.email}</p>
                    <p className="mt-2 text-[11px] font-semibold text-violet-200">{formatCredits(credits)}</p>
                  </div>
                  <ProfileMenuLink href="/credits" label="Credits" hint="Authoritative balance" icon={<CreditIcon />} active={active === 'Credits'} />
                  <ProfileMenuLink href="/settings" label="Settings" hint="Account and app" icon={<GearIcon />} active={active === 'Settings'} />
                  <button
                    type="button"
                    onClick={() => {
                      void signOut();
                      setProfileOpen(false);
                    }}
                    className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[13px] font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[0.035]"><SignOutIcon /></span>
                    <span>Sign out</span>
                  </button>
                </>
              ) : (
                <div className="p-1">
                  <p className="px-2 pt-2 text-[13px] font-semibold text-white">Save your SAVI workspace</p>
                  <p className="px-2 pt-1 text-[11px] leading-4 text-white/42">Sign in to keep your profile and credits connected.</p>
                  <button
                    type="button"
                    disabled={isAuthLoading}
                    onClick={() => signIn()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/14 bg-white/10 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-white/16 disabled:opacity-50"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>
                  <LegalConsentNotice className="mt-3 px-2" />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setProfileOpen((current) => !current)}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] ${collapsed ? 'justify-center px-0' : ''}`}
            aria-expanded={profileOpen}
          >
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-sky-400 text-[12px] font-bold text-white">
              {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : user?.name?.charAt(0).toUpperCase() || 'S'}
            </span>
            <span className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
              <span className="block truncate text-[14px] font-semibold text-white/86">{user?.name || 'Sign in to SAVI'}</span>
              <span className="block truncate text-[12px] text-white/38">{user ? formatCredits(credits) : 'Save your workspace'}</span>
            </span>
          </button>
        </div>

        {!collapsed ? <LegalLinks compact className="mt-3 px-3" /> : null}
      </aside>

      <header className="fixed left-0 top-0 z-40 flex h-[62px] w-full items-center gap-2 border-b border-white/[0.08] bg-[#151515]/96 px-3 text-white backdrop-blur-2xl lg:hidden">
        <Link href="/" className="flex items-center gap-2 rounded-2xl px-1 py-1" aria-label="SAVI home">
          <img src="/brand/savi-logo.png" alt="SAVI" className="h-8 w-8 rounded-xl object-cover" />
          <span className="text-[15px] font-semibold">SAVI</span>
        </Link>
        <nav className="ml-auto flex min-w-0 flex-1 justify-end gap-1 overflow-x-auto">
          {toolItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={(event) => handleModeClick(event, item.mode)}
              aria-label={item.label}
              aria-current={active === item.active ? 'page' : undefined}
              className={`grid h-9 min-w-9 place-items-center rounded-xl border text-white transition ${
                active === item.active ? 'border-white/18 bg-white/14' : 'border-transparent bg-transparent text-white/62 hover:bg-white/8 hover:text-white'
              }`}
            >
              {item.icon}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}

function formatCredits(credits: number | null | undefined) {
  return typeof credits === 'number' ? `${credits.toLocaleString()} credits` : 'Credits unavailable';
}

function SidebarLink({
  item,
  active,
  onClick,
  collapsed = false
}: {
  item: SidebarItem;
  active: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[14px] font-medium transition ${collapsed ? 'justify-center px-0' : ''} ${
        active ? 'bg-white/[0.105] text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)]' : 'text-white/66 hover:bg-white/[0.075] hover:text-white'
      }`}
    >
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl border ${
        active ? 'border-white/18 bg-white/10 text-white' : 'border-white/10 bg-white/[0.035] text-white/62'
      }`}>
        {item.icon}
      </span>
      <span className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
        <span className="block truncate leading-5">{item.label}</span>
        {item.hint && <span className="block truncate text-[11px] font-normal leading-4 text-white/38">{item.hint}</span>}
      </span>
    </Link>
  );
}

function ProfileMenuLink({
  href,
  label,
  hint,
  icon,
  active
}: {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition ${
        active ? 'bg-white/12 text-white' : 'text-white/62 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        <span className="block truncate text-[11px] font-normal text-white/34">{hint}</span>
      </span>
    </Link>
  );
}

function IconShell({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

function SparkIcon() {
  return <IconShell><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /></IconShell>;
}

function FrameIcon() {
  return <IconShell><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M8 15l2.4-2.4a1.4 1.4 0 0 1 2 0L16 16" /></IconShell>;
}

function VideoIcon() {
  return <IconShell><rect x="4" y="7" width="12" height="10" rx="2" /><path d="M16 10l4-2.5v9L16 14" /></IconShell>;
}

function WaveIcon() {
  return <IconShell><path d="M4 12h2" /><path d="M9 8v8" /><path d="M12 5v14" /><path d="M15 8v8" /><path d="M18 12h2" /></IconShell>;
}

function FileIcon() {
  return <IconShell><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></IconShell>;
}

function PlusIcon() {
  return <IconShell><path d="M12 5v14" /><path d="M5 12h14" /></IconShell>;
}

function ChevronLeftIcon() {
  return <IconShell><path d="M15 6l-6 6 6 6" /></IconShell>;
}

function ChevronRightIcon() {
  return <IconShell><path d="M9 6l6 6-6 6" /></IconShell>;
}

function ChevronDownIcon() {
  return <IconShell><path d="M6 9l6 6 6-6" /></IconShell>;
}

function GridIcon() {
  return <IconShell><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></IconShell>;
}

function CreditIcon() {
  return <IconShell><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 4v5h5" /></IconShell>;
}

function GearIcon() {
  return <IconShell><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /><path d="M3 12h2" /><path d="M19 12h2" /><path d="M12 3v2" /><path d="M12 19v2" /></IconShell>;
}

function SignOutIcon() {
  return <IconShell><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></IconShell>;
}

function GoogleIcon() {
  return <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-900">G</span>;
}
