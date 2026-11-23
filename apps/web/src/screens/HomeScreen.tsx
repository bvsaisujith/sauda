import { useState } from 'react';
import { useSession } from '../session/SessionProvider';

const NEXT_UP = [
  { title: 'Items and prices', detail: 'Add items, set selling and buying prices, HSN and GST.' },
  { title: 'Stock batches', detail: 'Receive stock, watch expiry and FIFO layers.' },
  { title: 'Voice commands', detail: 'English commands first, 22-language input next.' },
];

export default function HomeScreen() {
  const { shop, logout } = useSession();
  const [busy, setBusy] = useState(false);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Sauda</p>
            <h1 className="text-2xl font-semibold tracking-tight">{shop?.name}</h1>
            <p className="text-sm text-muted-foreground">Signed in on this device</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void logout().finally(() => {
                setBusy(false);
              });
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition hover:border-ring hover:text-primary disabled:opacity-60"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </header>

        <section className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
          <h2 className="text-lg font-semibold">The shop is ready</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Items, prices and stock come next. Voice is a second front door onto the same
            operations, and nothing it proposes is saved until you approve it.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {NEXT_UP.map((item) => (
            <article key={item.title} className="rounded-xl border border-border bg-card p-4 text-card-foreground">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Next</p>
              <h3 className="mt-2 text-sm font-semibold text-card-foreground">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
