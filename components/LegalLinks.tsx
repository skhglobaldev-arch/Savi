import Link from 'next/link';

const links = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/ai-disclaimer', label: 'AI use' },
  { href: '/refunds', label: 'Billing' }
];

export function LegalLinks({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? 'text-[11px]' : 'text-xs'} ${className}`}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="inline-flex min-h-[44px] items-center text-white/42 transition hover:text-white">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function LegalConsentNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[10px] leading-4 text-white/38 ${className}`}>
      By continuing with Google, you agree to the <Link className="text-white/62 underline underline-offset-2 hover:text-white" href="/terms">Terms</Link> and acknowledge the <Link className="text-white/62 underline underline-offset-2 hover:text-white" href="/privacy">Privacy Policy</Link>.
    </p>
  );
}
