import { useCallback, useEffect, useState } from 'react';
import type { OrderWithPartyDto } from '@sauda/shared';
import { api, ApiError } from '../lib/api';
import { formatDate, formatQuantity, formatRupees } from '../lib/money';
import OrderFormScreen from './OrderFormScreen';
import { BackButton, ErrorNote, FlashNote, LoadingNote } from '../components/states';
import {
  cardClass,
  dangerButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui';

export default function OrderDetailScreen({
  orderId,
  onBack,
  onOpenBill,
}: {
  orderId: string;
  onBack: () => void;
  onOpenBill: (billId: string) => void;
}) {
  const [order, setOrder] = useState<OrderWithPartyDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);

    try {
      setOrder(await api.getOrder(orderId));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the order');
    }
  }, [orderId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fulfil = async () => {
    setError(null);
    setBusy(true);

    try {
      const bill = await api.fulfilOrder(orderId);
      setFlash(`Order fulfilled. Bill ${bill.billNumber} created.`);
      await reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not fulfil the order');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const warning =
      order?.status === 'fulfilled'
        ? 'This order is fulfilled. Deleting it also deletes its bill and reverses the stock effect. Continue?'
        : 'Delete this order? The record is kept in the history.';

    if (!window.confirm(warning)) {
      return;
    }

    setError(null);
    setBusy(true);

    try {
      await api.deleteOrder(orderId);
      onBack();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete the order');
    } finally {
      setBusy(false);
    }
  };

  if (editing && order !== null) {
    return (
      <OrderFormScreen
        type={order.type}
        initial={order}
        onSaved={() => {
          setEditing(false);
          setFlash('Order updated.');
          void reload();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (order === null) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} label="Back to orders" />
        <ErrorNote message={error} />
        <LoadingNote label="Loading order…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton onClick={onBack} label="Back to orders" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </button>
          {order.status === 'pending' ? (
            <button type="button" className={primaryButtonClass} onClick={() => void fulfil()} disabled={busy}>
              {busy ? 'Working…' : 'Mark fulfilled'}
            </button>
          ) : order.billId === null ? null : (
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => onOpenBill(order.billId as string)}
              disabled={busy}
            >
              Open bill
            </button>
          )}
          <button type="button" className={dangerButtonClass} onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
        </div>
      </div>

      <ErrorNote message={error} />
      <FlashNote message={flash} />

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{order.partyName}</h2>
              <span
                className={
                  order.status === 'fulfilled'
                    ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary'
                    : 'rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent'
                }
              >
                {order.status === 'fulfilled' ? 'Fulfilled' : 'Pending'}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {order.type === 'customer' ? 'Customer order' : 'Supplier order'}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(order.orderDate)}
              {order.notes === null ? '' : ` · ${order.notes}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Order total</p>
            <p className="text-2xl font-semibold">{formatRupees(order.totalPaise)}</p>
          </div>
        </div>

        <ul className="mt-4 divide-y divide-border">
          {order.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">
                  {order.itemNames?.[line.itemId] ?? 'Removed item'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatQuantity(line.quantity)} × {formatRupees(line.ratePaise)}
                </p>
              </div>
              <p className="text-sm font-semibold">{formatRupees(line.lineTotalPaise)}</p>
            </li>
          ))}
        </ul>
      </div>

      {order.status === 'fulfilled' ? (
        <p className="text-sm text-muted-foreground">
          Fulfilled orders change stock. Editing the lines applies only the difference to stock.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Fulfilling a customer order reduces stock. A supplier order increases it.
        </p>
      )}
    </div>
  );
}
