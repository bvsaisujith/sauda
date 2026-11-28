import { useCallback, useEffect, useState } from 'react';
import type { OrderWithPartyDto, PartyType } from '@sauda/shared';
import { api, ApiError } from '../lib/api';
import { formatDate, formatRupees } from '../lib/money';
import OrderFormScreen from './OrderFormScreen';
import { EmptyState, ErrorNote, LoadingNote } from '../components/states';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

type StatusFilter = 'pending' | 'fulfilled' | 'all';

export default function OrdersScreen({
  onOpenOrder,
  onOpenBill,
  prefill,
}: {
  onOpenOrder: (orderId: string) => void;
  onOpenBill: (billId: string) => void;
  prefill?: { type: PartyType; partyId: string; partyName: string };
}) {
  const [type, setType] = useState<PartyType>(prefill?.type ?? 'customer');
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [orders, setOrders] = useState<OrderWithPartyDto[] | null>(null);
  const [creating, setCreating] = useState(prefill !== undefined);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);

    try {
      setOrders(
        await api.listOrders({
          type,
          ...(status === 'all' ? {} : { status }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load orders');
    }
  }, [type, status]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (creating) {
    return (
      <OrderFormScreen
        type={type}
        {...(prefill === undefined
          ? {}
          : { defaultParty: { id: prefill.partyId, name: prefill.partyName } })}
        onSaved={(result) => {
          setCreating(false);
          setFlash(
            result.bill === undefined
              ? 'Order saved as pending.'
              : `Order fulfilled. Bill ${result.bill.billNumber} created.`,
          );

          if (result.bill !== undefined) {
            onOpenBill(result.bill.id);
            return;
          }

          void reload();
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Orders</h2>
          <p className="text-sm text-muted-foreground">
            Pending orders are editable. Fulfilling one creates its bill.
          </p>
        </div>
        <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
          New order
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['customer', 'supplier'] as PartyType[]).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setType(entry)}
            className={
              type === entry
                ? 'rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground'
                : 'rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground'
            }
          >
            {entry === 'customer' ? 'Customer orders' : 'Supplier orders'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'pending', label: 'Pending' },
            { id: 'fulfilled', label: 'Fulfilled' },
            { id: 'all', label: 'All' },
          ] as { id: StatusFilter; label: string }[]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setStatus(entry.id)}
            className={
              status === entry.id
                ? 'rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background'
                : 'rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground'
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />
      {flash === null ? null : (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">{flash}</p>
      )}

      {orders === null ? (
        <LoadingNote label="Loading orders…" />
      ) : orders.length === 0 ? (
        <EmptyState
          title={`No ${status === 'all' ? '' : status} ${type} orders`}
          body={
            type === 'customer'
              ? 'Create an order when a customer asks for goods. Fulfil it to make the bill.'
              : 'Create a purchase order when you need stock. Fulfil it to bring the stock in.'
          }
          action={
            <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
              New {type} order
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => onOpenOrder(order.id)}
                className={`${cardClass} w-full text-left transition hover:border-ring`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{order.partyName}</h3>
                      <span
                        className={
                          order.status === 'fulfilled'
                            ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'
                            : 'rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent'
                        }
                      >
                        {order.status === 'fulfilled' ? 'Fulfilled' : 'Pending'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(order.orderDate)} · {order.lines.length}{' '}
                      {order.lines.length === 1 ? 'line' : 'lines'}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-semibold">{formatRupees(order.totalPaise)}</p>
                    {order.billId === null ? null : (
                      <p className="text-xs text-muted-foreground">Bill created</p>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Tip: open an order to edit it, mark it fulfilled, or delete it.
      </p>

      {orders !== null && orders.length > 0 ? (
        <button type="button" className={secondaryButtonClass} onClick={() => void reload()}>
          Refresh
        </button>
      ) : null}
    </div>
  );
}
