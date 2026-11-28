import { useState } from 'react';
import type { PartyWithBalanceDto } from '@sauda/shared';
import { useSession } from '../session/SessionProvider';
import DashboardScreen from './DashboardScreen';
import OrdersScreen from './OrdersScreen';
import OrderDetailScreen from './OrderDetailScreen';
import BillDetailScreen from './BillDetailScreen';
import PartiesScreen from './PartiesScreen';
import PartyDetailScreen from './PartyDetailScreen';
import ItemsScreen from './ItemsScreen';
import StockScreen from './StockScreen';
import { BackButton } from '../components/states';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

type Tab = 'home' | 'orders' | 'items' | 'stock' | 'parties';

type Route =
  | { name: 'tab'; tab: Tab }
  | { name: 'order'; orderId: string }
  | { name: 'bill'; billId: string }
  | { name: 'party'; partyId: string };

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'orders', label: 'Orders' },
  { id: 'items', label: 'Items' },
  { id: 'stock', label: 'Stock' },
  { id: 'parties', label: 'Parties' },
];

export default function HomeScreen() {
  const { shop, logout } = useSession();
  const [route, setRoute] = useState<Route>({ name: 'tab', tab: 'home' });
  const [orderPrefill, setOrderPrefill] = useState<
    { type: 'customer' | 'supplier'; partyId: string; partyName: string } | undefined
  >(undefined);
  const [busy, setBusy] = useState(false);

  const openTab = (tab: Tab) => {
    setOrderPrefill(undefined);
    setRoute({ name: 'tab', tab });
  };

  const activeTab = route.name === 'tab' ? route.tab : null;

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

        {route.name !== 'tab' ? (
          <BackButton
            onClick={() => openTab(route.name === 'party' ? 'parties' : route.name === 'bill' ? 'home' : 'orders')}
            label={
              route.name === 'party'
                ? 'Back to parties'
                : route.name === 'bill'
                  ? 'Back to bills'
                  : 'Back to orders'
            }
          />
        ) : (
          <nav className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-1">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => openTab(entry.id)}
                className={
                  activeTab === entry.id
                    ? 'flex-1 whitespace-nowrap rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground'
                    : 'flex-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground'
                }
              >
                {entry.label}
              </button>
            ))}
          </nav>
        )}

        {route.name === 'tab' && route.tab === 'home' ? (
          <DashboardScreen
            onOpenBill={(billId) => setRoute({ name: 'bill', billId })}
            onGoOrders={() => openTab('orders')}
          />
        ) : null}

        {route.name === 'tab' && route.tab === 'orders' ? (
          <OrdersScreen
            {...(orderPrefill === undefined ? {} : { prefill: orderPrefill })}
            onOpenOrder={(orderId) => setRoute({ name: 'order', orderId })}
            onOpenBill={(billId) => setRoute({ name: 'bill', billId })}
          />
        ) : null}

        {route.name === 'order' ? (
          <OrderDetailScreen
            orderId={route.orderId}
            onBack={() => openTab('orders')}
            onOpenBill={(billId) => setRoute({ name: 'bill', billId })}
          />
        ) : null}

        {route.name === 'bill' ? (
          <BillDetailScreen
            billId={route.billId}
            onBack={() => openTab('home')}
            onOpenOrder={(orderId) => setRoute({ name: 'order', orderId })}
          />
        ) : null}

        {route.name === 'tab' && route.tab === 'parties' ? (
          <PartiesScreen onOpenParty={(partyId) => setRoute({ name: 'party', partyId })} />
        ) : null}

        {route.name === 'party' ? (
          <PartyDetailScreen
            partyId={route.partyId}
            onBack={() => openTab('parties')}
            onOpenBill={(billId) => setRoute({ name: 'bill', billId })}
            onNewOrder={(party: PartyWithBalanceDto) => {
              setOrderPrefill({ type: party.type, partyId: party.id, partyName: party.name });
              setRoute({ name: 'tab', tab: 'orders' });
            }}
          />
        ) : null}

        {route.name === 'tab' && route.tab === 'items' ? <ItemsScreen /> : null}

        {route.name === 'tab' && route.tab === 'stock' ? <StockScreen /> : null}

        {activeTab === 'home' ? (
          <div className={`${cardClass} space-y-2`}>
            <h3 className="text-base font-semibold">Voice is next</h3>
            <p className="text-sm text-muted-foreground">
              English first, then 22 Indian languages. Every voice change is shown as a preview
              and saved only after you approve it.
            </p>
            <button type="button" className={secondaryButtonClass} onClick={() => openTab('orders')}>
              Start an order
            </button>
            <button type="button" className={primaryButtonClass} onClick={() => openTab('parties')}>
              Add a party
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}