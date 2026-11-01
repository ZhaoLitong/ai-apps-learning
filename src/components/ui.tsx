// Small shared UI primitives. No component library — every piece is plain
// Tailwind classes so you can see (and restyle) exactly what's happening.

export function PageHeader({
  title,
  lead,
  files,
}: {
  title: string;
  lead: string;
  /** Source files that implement this page's feature. */
  files?: string[];
}) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold text-neutral-100">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400">{lead}</p>
      {files && files.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span className="uppercase tracking-wide">Read the code:</span>
          {files.map((file) => (
            <code
              key={file}
              className="rounded bg-neutral-800/80 px-2 py-0.5 font-mono text-[11px] text-indigo-300"
            >
              {file}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 ${className}`}>
      {children}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
    ghost: 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800',
    danger: 'border border-red-900/60 text-red-300 hover:bg-red-950/40',
  } as const;
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500 focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'indigo' | 'green' | 'red' | 'amber';
}) {
  const tones = {
    neutral: 'bg-neutral-800 text-neutral-300',
    indigo: 'bg-indigo-500/15 text-indigo-300',
    green: 'bg-emerald-500/15 text-emerald-300',
    red: 'bg-red-500/15 text-red-300',
    amber: 'bg-amber-500/15 text-amber-300',
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-neutral-400">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-600 border-t-indigo-400" />
      {label}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-800 px-6 py-10 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}

/** Pretty-printed JSON in a dark pre block. */
export function JsonPre({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-lg bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
