'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { ToolMode } from './ToolModeSelector';
import { useSaviAuth } from '@/lib/auth/useSaviAuth';
import { LegalConsentNotice } from './LegalLinks';

export type SidebarMode = ToolMode | 'All Media' | 'All Tools';
export type SidebarActive = SidebarMode | 'Credits' | 'Settings' | 'Activity';

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
    label: 'All Tools',
    hint: 'Browse every workspace',
    mode: 'All Tools',
    href: '/workspace?view=tools',
    active: 'All Tools',
    icon: <ToolBoxIcon />
  }
];

const createItems: SidebarItem[] = [
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

const libraryItem: SidebarItem = {
  label: 'Library',
  hint: 'Your generated work',
  mode: 'All Media',
  href: '/workspace?view=media',
  active: 'All Media',
  icon: <GridIcon />
};

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPlanLabel, setCurrentPlanLabel] = useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { user, isLoading: isAuthLoading, signIn, signOut } = useSaviAuth();

  useEffect(() => {
    function refreshChats() {
      try {
        const value = window.localStorage.getItem(CHAT_SESSIONS_KEY);
        const parsed = value ? (JSON.parse(value) as SidebarChatSession[]) : [];
        setChatSessions(Array.isArray(parsed)
          ? parsed.filter((item) => item.title?.trim() && item.title !== 'New chat').slice(0, 6)
          : []);
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

  useEffect(() => {
    if (!mobileMenuOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => mobileDrawerRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      (previousFocusRef.current || mobileMenuButtonRef.current)?.focus();
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen && !profileOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (profileOpen) {
          setProfileOpen(false);
          return;
        }
        setMobileMenuOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !mobileMenuOpen) return;
      const drawer = mobileDrawerRef.current;
      if (!drawer) return;

      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen, profileOpen]);

  useEffect(() => {
    setCurrentPlanLabel(null);
    setIsPlanLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!profileOpen || !user?.id || currentPlanLabel !== null) return;

    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setCurrentPlanLabel('Plan unavailable');
      setIsPlanLoading(false);
    }, 5000);
    setIsPlanLoading(true);
    void fetch('/api/commerce/account', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal
    })
      .then(async (response) => ({
        response,
        data: await response.json().catch(() => ({})) as {
          catalog?: { plans?: Array<{ id: string; displayName: string }> };
          currentSubscription?: { planId?: string } | null;
        }
      }))
      .then(({ response, data }) => {
        if (!response.ok) {
          setCurrentPlanLabel('Plan unavailable');
          return;
        }
        const planId = data.currentSubscription?.planId;
        const plan = data.catalog?.plans?.find((item) => item.id === planId);
        setCurrentPlanLabel(plan?.displayName || 'Free');
      })
      .catch(() => {
        if (!controller.signal.aborted || timedOut) setCurrentPlanLabel('Plan unavailable');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!controller.signal.aborted) setIsPlanLoading(false);
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [currentPlanLabel, profileOpen, user?.id]);

  function handleModeClick(event: MouseEvent<HTMLAnchorElement>, mode?: SidebarMode) {
    if (!mode || !onOpenMode) return;
    event.preventDefault();
    if (mode === 'Ask AI') {
      window.history.replaceState(null, '', '/workspace');
      window.dispatchEvent(new CustomEvent(CHAT_NEW_EVENT));
    }
    onOpenMode(mode);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    setProfileOpen(false);
  }

  function handleMobileModeClick(event: MouseEvent<HTMLAnchorElement>, mode?: SidebarMode) {
    handleModeClick(event, mode);
    if (mode) closeMobileMenu();
  }

  function renderAccountMenu() {
    if (!user) {
      return (
        <div className="p-1">
          <p className="px-2 pt-1 text-sm font-semibold text-white">Save your SAVI workspace</p>
          <p className="px-2 pt-1 text-xs leading-5 text-white/50">Sign in to keep your profile and credits connected.</p>
          <button
            type="button"
            disabled={isAuthLoading}
            onClick={() => signIn()}
            className="savi-button savi-button-secondary mt-3 w-full"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <LegalConsentNotice className="mt-3 px-2" />
        </div>
      );
    }

    return (
      <>
        <div className="mb-2 border-b border-white/10 px-3 pb-3">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="mt-0.5 truncate text-xs text-white/50">{user.email}</p>
          <p className="mt-2 text-xs font-semibold text-violet-200">
            {isPlanLoading ? 'Loading plan...' : `${currentPlanLabel || 'Plan details'} · ${formatCredits(credits)}`}
          </p>
        </div>
        <ProfileMenuLink href="/credits" label="Credits & Plans" hint="Balance and available plans" icon={<CreditIcon />} active={active === 'Credits'} onClick={closeMobileMenu} />
        <ProfileMenuLink href="/settings" label="Settings" hint="Account and workspace" icon={<GearIcon />} active={active === 'Settings'} onClick={closeMobileMenu} />
        <ProfileMenuLink href="/settings#billing" label="Manage billing" hint="Subscription and payments" icon={<CardIcon />} active={false} onClick={closeMobileMenu} />
        <div className="my-2 border-t border-white/10" />
        <button
          type="button"
          onClick={() => {
            void signOut();
            closeMobileMenu();
          }}
          className="savi-button savi-button-ghost w-full justify-start px-3"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center"><SignOutIcon /></span>
          <span>Sign out</span>
        </button>
      </>
    );
  }

  return (
    <>
      <aside className={`savi-global-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col overflow-visible border-r border-[var(--savi-border-subtle)] bg-[var(--savi-bg-subtle)] px-3 py-3 text-white lg:flex ${collapsed ? 'items-center' : ''}`}>
        <div className={`flex w-full items-center gap-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Link href="/" className={`flex min-h-[44px] min-w-0 items-center gap-3 rounded-lg px-1.5 py-1.5 transition hover:bg-white/[0.045] ${collapsed ? 'justify-center' : ''}`} aria-label="SAVI home">
            <img src="/brand/savi-logo.png" alt="SAVI" className="h-9 w-auto max-w-9 object-contain" />
            <span className={`min-w-0 transition ${collapsed ? 'hidden' : 'block'}`}>
              <span className="block truncate text-[16px] font-semibold leading-5 text-white">SAVI</span>
              <span className="block truncate text-xs font-medium text-white/45">by SKH.GLOBAL</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="savi-icon-button"
            aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>

        <div className="mt-4 w-full flex-1 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.22)_transparent]">
        <nav className="space-y-1">
          {toolItems.map((item) => (
            <SidebarLink key={item.label} item={item} active={active === item.active} collapsed={collapsed} onClick={(event) => handleModeClick(event, item.mode)} />
          ))}
        </nav>

        <div className="mt-5">
          {!collapsed && <p className="px-3 pb-2 text-xs font-medium text-white/40">Create</p>}
          <nav className="space-y-1">
            {createItems.map((item) => (
              <SidebarLink key={item.label} item={item} active={active === item.active} collapsed={collapsed} onClick={(event) => handleModeClick(event, item.mode)} />
            ))}
          </nav>
        </div>

        <div className="mt-1">
          <SidebarLink item={libraryItem} active={active === libraryItem.active} collapsed={collapsed} onClick={(event) => handleModeClick(event, libraryItem.mode)} />
        </div>

        {!collapsed && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setChatsOpen((current) => !current)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium text-white/45 transition hover:bg-white/[0.045] hover:text-white/70"
              aria-expanded={chatsOpen}
            >
              <span>Chats</span>
              <span className="text-white/45">{chatsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}</span>
            </button>
            {chatsOpen && (
              <div className="mt-1 space-y-1">
                {chatSessions.length ? chatSessions.map((chat) => (
                  <div key={chat.id} className="group flex items-center gap-1 rounded-lg text-white/65 transition hover:bg-white/[0.045]">
                    <Link
                      href={`/workspace?chat=${encodeURIComponent(chat.id)}`}
                      onClick={(event) => {
                        if (!onOpenMode) return;
                        event.preventDefault();
                        onOpenMode('Ask AI');
                        window.history.replaceState(null, '', `/workspace?chat=${encodeURIComponent(chat.id)}`);
                        window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { chatId: chat.id } }));
                      }}
                      className="min-h-[44px] min-w-0 flex-1 px-3 py-2.5"
                    >
                      <span className="block truncate text-sm font-medium">{chat.title || 'Conversation'}</span>
                      <span className="block truncate text-xs text-white/40">{new Date(chat.updatedAt).toLocaleDateString()}</span>
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
                      className="savi-icon-button mr-1 text-white/40 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={`Close ${chat.title || 'chat'}`}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                )) : (
                  <p className="px-3 py-2 text-xs text-white/40">No chats yet</p>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        <div className="mt-3 w-full shrink-0">
          <Link
            href="/credits"
            className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${active === 'Credits' ? 'border-violet-300/25 bg-violet-400/[0.1] text-white' : 'border-transparent text-white/70 hover:bg-white/[0.045] hover:text-white'} ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center text-violet-200"><CreditIcon /></span>
            <span className={collapsed ? 'hidden' : 'min-w-0'}>
              <span className="block text-sm font-semibold">Credits</span>
              <span className="block truncate text-xs text-white/45">{formatCredits(credits)}</span>
            </span>
          </Link>
        </div>

        <div className="relative mt-2 w-full shrink-0">
          {profileOpen && (
            <div className={`savi-elevated absolute bottom-[calc(100%+8px)] z-50 w-64 p-2 ${collapsed ? 'left-full ml-3' : 'left-0 right-0'}`}>
              {renderAccountMenu()}
            </div>
          )}

          <button
            type="button"
            onClick={() => setProfileOpen((current) => !current)}
            className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition hover:bg-white/[0.045] ${collapsed ? 'justify-center px-0' : ''}`}
            aria-label={profileOpen ? 'Close account menu' : user ? 'Open account menu' : 'Sign in to SAVI'}
            aria-expanded={profileOpen}
          >
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-violet-600 text-xs font-bold text-white">
              {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : user?.name?.charAt(0).toUpperCase() || 'S'}
            </span>
            <span className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
              <span className="block truncate text-sm font-semibold text-white/90">{user?.name || 'Sign in to SAVI'}</span>
              <span className="block truncate text-xs text-white/45">{user ? formatCredits(credits) : 'Save your workspace'}</span>
            </span>
          </button>
        </div>

      </aside>

      <header className="savi-mobile-bar fixed left-0 top-0 z-40 flex w-full items-center gap-2 border-b border-[var(--savi-border-subtle)] bg-[var(--savi-bg-subtle)]/95 px-3 text-white backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex min-h-[44px] items-center gap-2 rounded-lg px-1 py-1" aria-label="SAVI home">
          <img src="/brand/savi-logo.png" alt="SAVI" className="h-8 w-auto max-w-8 object-contain" />
          <span className="text-[15px] font-semibold">SAVI</span>
        </Link>
        <button
          ref={mobileMenuButtonRef}
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="savi-icon-button ml-auto border border-white/10"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="savi-mobile-drawer"
        >
          <MenuIcon />
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label="Close navigation menu" onClick={closeMobileMenu} />
          <aside
            ref={mobileDrawerRef}
            id="savi-mobile-drawer"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="SAVI navigation"
            className="savi-mobile-drawer relative flex h-full w-[min(88vw,340px)] flex-col overflow-y-auto border-r border-white/10 bg-[var(--savi-bg-subtle)] px-4 pb-6 text-white shadow-[18px_0_52px_rgba(0,0,0,0.42)]"
          >
            <div className="flex items-center justify-between gap-3">
              <Link href="/" onClick={closeMobileMenu} className="flex min-h-[44px] items-center gap-2 rounded-lg px-1 py-1" aria-label="SAVI home">
                <img src="/brand/savi-logo.png" alt="SAVI" className="h-8 w-auto max-w-8 object-contain" />
                <span className="text-[15px] font-semibold">SAVI</span>
              </Link>
              <button type="button" onClick={closeMobileMenu} className="savi-icon-button border border-white/10" aria-label="Close navigation menu">
                <CloseIcon />
              </button>
            </div>

            <nav className="mt-6 space-y-1">
              {toolItems.map((item) => (
                <SidebarLink key={item.label} item={item} active={active === item.active} onClick={(event) => handleMobileModeClick(event, item.mode)} />
              ))}
            </nav>

            <div className="mt-5">
              <p className="px-3 pb-2 text-xs font-medium text-white/40">Create</p>
              <nav className="space-y-1">
                {createItems.map((item) => (
                  <SidebarLink key={item.label} item={item} active={active === item.active} onClick={(event) => handleMobileModeClick(event, item.mode)} />
                ))}
              </nav>
            </div>

            <div className="mt-1">
              <SidebarLink item={libraryItem} active={active === libraryItem.active} onClick={(event) => handleMobileModeClick(event, libraryItem.mode)} />
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <Link href="/credits" onClick={closeMobileMenu} className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 transition ${active === 'Credits' ? 'border-violet-300/25 bg-violet-400/[0.1] text-white' : 'border-transparent text-white/70 hover:bg-white/[0.045]'}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center text-violet-200"><CreditIcon /></span>
                <span>
                  <span className="block text-sm font-semibold">Credits & Plans</span>
                  <span className="block text-xs text-white/45">{formatCredits(credits)}</span>
                </span>
              </Link>
              <Link href="/settings" onClick={closeMobileMenu} className={`mt-1 flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 transition ${active === 'Settings' ? 'border-violet-300/25 bg-violet-400/[0.1] text-white' : 'border-transparent text-white/70 hover:bg-white/[0.045]'}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center"><GearIcon /></span>
                <span className="text-sm font-semibold">Settings</span>
              </Link>
            </div>

            <div className="mt-auto border-t border-white/10 pt-4">
              <button type="button" onClick={() => setProfileOpen((current) => !current)} className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.045]" aria-label={profileOpen ? 'Close account menu' : user ? 'Open account menu' : 'Sign in to SAVI'} aria-expanded={profileOpen} aria-controls="savi-mobile-account-menu">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-600 text-xs font-bold text-white">
                  {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : user?.name?.charAt(0).toUpperCase() || 'S'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white/90">{user?.name || 'Sign in to SAVI'}</span>
                  <span className="block truncate text-xs text-white/45">{user ? formatCredits(credits) : 'Connect your workspace'}</span>
                </span>
                <ChevronDownIcon />
              </button>
              {profileOpen && <div id="savi-mobile-account-menu" className="savi-elevated mt-2 p-2">{renderAccountMenu()}</div>}
            </div>
          </aside>
        </div>
      )}
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
      aria-label={item.hint ? `${item.label}, ${item.hint}` : item.label}
      title={collapsed ? item.label : undefined}
      className={`group flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition ${collapsed ? 'justify-center px-0' : ''} ${
        active ? 'border-violet-300/25 bg-violet-400/[0.1] text-white shadow-[inset_0_0_18px_rgba(124,58,237,0.06)]' : 'border-transparent text-white/68 hover:bg-white/[0.045] hover:text-white'
      }`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center ${active ? 'text-violet-200' : 'text-white/58 group-hover:text-white/80'}`}>
        {item.icon}
      </span>
      <span className={`min-w-0 ${collapsed ? 'hidden' : 'block'}`}>
        <span className="block truncate leading-5">{item.label}</span>
      </span>
    </Link>
  );
}

function ProfileMenuLink({
  href,
  label,
  hint,
  icon,
  active,
  onClick
}: {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
        active ? 'border-violet-300/25 bg-violet-400/[0.1] text-white' : 'border-transparent text-white/68 hover:bg-white/[0.045] hover:text-white'
      }`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        <span className="block truncate text-xs font-normal text-white/42">{hint}</span>
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

function ToolBoxIcon() {
  return <IconShell><path d="M4 8.5h16v10H4z" /><path d="M8 8.5v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12.5h16M10 12.5v2h4v-2" /></IconShell>;
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

function CardIcon() {
  return <IconShell><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h3" /></IconShell>;
}

function SignOutIcon() {
  return <IconShell><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></IconShell>;
}

function GoogleIcon() {
  return <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-bold text-slate-900">G</span>;
}

function MenuIcon() {
  return <IconShell><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></IconShell>;
}

function CloseIcon() {
  return <IconShell><path d="M6 6l12 12" /><path d="M18 6L6 18" /></IconShell>;
}
