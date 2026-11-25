import { useState } from 'react';
import { useSession } from '../session/SessionProvider';
import ItemsScreen from './ItemsScreen';
import StockScreen from './StockScreen';

type Tab = 'items' | 'stock';

const TABS: { id: Tab; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'stock', label: 'Stock' },
];

export default function HomeScreen() {
  const { shop, logout } = useSession();
  const [tab, setTab] = useState<Tab>('items');
  const [busy, setBusy] = useState(false);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Sauda</p>
            <h1 className="text-2xl font-semibold tracking-tight">{shop?.name}</h1>
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

        <nav className="flex gap-2 rounded-xl border border-border bg-card p-1">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={
                tab === entry.id
                  ? 'flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground'
                  : 'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground'
              }
            >
              {entry.label}
            </button>
          ))}
        </nav>

        {tab === 'items' ? <ItemsScreen /> : <StockScreen />}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Voice commands come next: English first, then 22 Indian languages. Every voice change is
          shown as a preview and saved only after you approve it.
        </p>
      </div>
    </main>
  );
}
