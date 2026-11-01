// Root layout: dark shell + top navigation. Every page renders inside <main>.
import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { NavLinks } from '@/components/nav';

export const metadata: Metadata = {
  title: { default: 'AI Learning Lab', template: '%s · AI Learning Lab' },
  description:
    'A small, complete AI app built to be read: RAG, embeddings, tool calling, memory, observability and evals on Next.js + Postgres/pgvector.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-200 antialiased">
        <header className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="bg-gradient-to-r from-indigo-400 to-fuchsia-400 bg-clip-text font-semibold text-transparent">
              AI Learning Lab
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8">{children}</main>
        <footer className="border-t border-neutral-800/60 py-6 text-center text-xs text-neutral-500">
          Every feature here exists to be read. Start with README.md, then follow the home page path.
        </footer>
      </body>
    </html>
  );
}
