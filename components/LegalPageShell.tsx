import Link from 'next/link';
import { getLegalConfiguration } from '@/lib/legal/config';
import { LegalLinks } from './LegalLinks';

export function LegalPageShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const legal = getLegalConfiguration();

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-[#101012]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-4">
          <Link href="/" className="flex items-center gap-3" aria-label="SAVI home">
            <img src="/brand/savi-logo.png" alt="SAVI" className="h-9 w-9 rounded-xl object-cover" />
            <span>
              <span className="block text-sm font-semibold">SAVI</span>
              <span className="block text-[11px] text-white/42">by SKH.GLOBAL</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-xs font-semibold text-white/58">
            <Link href="/workspace" className="hidden hover:text-white sm:block">Workspace</Link>
            <Link href="/credits" className="hidden hover:text-white sm:block">Credits</Link>
            <Link href="/settings" className="hover:text-white">Settings</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-300/80">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-white/62">{description}</p>

        {!legal.operatorDetailsReady ? (
          <div className="mt-8 border-l-2 border-amber-300/70 bg-amber-300/[0.08] px-4 py-3 text-sm leading-6 text-amber-100/85">
            Operator identity, contact, jurisdiction, and effective-date values are configuration placeholders and must be completed before launch.
          </div>
        ) : null}

        <article className="mt-12 space-y-12 text-[15px] leading-8 text-white/72">
          {children}
        </article>

        <footer className="mt-16 border-t border-white/10 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/38">SAVI legal information · {legal.effectiveDate}</p>
            <LegalLinks />
          </div>
        </footer>
      </section>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/10 pt-7">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6 marker:text-violet-300/70">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

