'use client';

// The nav needs usePathname (browser state) to highlight the active page, so
// it's a client component while the layout stays a server component.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/chat', label: 'Chat' },
  { href: '/documents', label: 'Documents' },
  { href: '/retrieval', label: 'Retrieval' },
  { href: '/memory', label: 'Memory' },
  { href: '/traces', label: 'Traces' },
  { href: '/evals', label: 'Evals' },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? 'rounded-md bg-indigo-500/15 px-3 py-1.5 text-indigo-300'
                : 'rounded-md px-3 py-1.5 text-neutral-400 transition-colors hover:bg-neutral-800/70 hover:text-neutral-200'
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
