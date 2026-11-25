import { useCallback, useEffect, useState } from 'react';
import {
  UNIT_LABELS,
  type ItemWithStockDto,
  type StockMovementDto,
} from '@sauda/shared';
import { api, ApiError } from '../lib/api';
import { formatDateTime, formatQuantity, formatRupees, rupeesToPaise } from '../lib/money';
import {
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui';

const MOVEMENT_LABELS: Record<StockMovementDto['type'], string> = {
  RECEIPT: 'Stock in',
  SALE: 'Sale',
  ADJUSTMENT: 'Adjustment',
  REPACK_CONSUME: 'Repack out',
  REPACK_PRODUCE: 'Repack in',
  REVERSAL: 'Reversal',
};

export default function StockScreen() {
  const [items, setItems] = useState<ItemWithStockDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movements, setMovements] = useState<StockMovementDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [note, setNote] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = items?.find((item) => item.id === selectedId) ?? null;

  const loadItems = useCallback(async () => {
    const list = await api.listItems();
    setItems(list);
    setSelectedId((current) => {
      if (current !== null && list.some((item) => item.id === current)) {
        return current;
      }
      return list[0]?.id ?? null;
    });
  }, []);

  const loadMovements = useCallback(async (itemId: string) => {
    setMovements(await api.listMovements(itemId));
  }, []);

  useEffect(() => {
    loadItems().catch((cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Could not load stock');
    });
  }, [loadItems]);

  useEffect(() => {
    if (selectedId === null) {
      setMovements([]);
      return;
    }

    loadMovements(selectedId).catch((cause: unknown) => {
      setError(cause instanceof ApiError ? cause.message : 'Could not load movements');
    });
  }, [selectedId, loadMovements]);

  const refresh = async (itemId: string, message: string) => {
    await loadItems();
    await loadMovements(itemId);
    setFlash(message);
  };

  const receive = async (event: React.FormEvent) => {
    event.preventDefault();

    if (selected === null) {
      return;
    }

    setError(null);
    setFlash(null);

    const amount = Number(quantity);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter how much stock came in');
      return;
    }

    const costPaise = unitCost.trim() === '' ? undefined : rupeesToPaise(unitCost);

    if (costPaise === null) {
      setError('Enter a valid buying price or leave it empty');
      return;
    }

    setBusy(true);

    try {
      const result = await api.receiveStock({
        itemId: selected.id,
        quantity: amount,
        ...(costPaise === undefined ? {} : { unitCostPaise: costPaise }),
        ...(expiryDate === '' ? {} : { expiryDate }),
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      });
      setQuantity('');
      setUnitCost('');
      setExpiryDate('');
      setNote('');
      await refresh(
        selected.id,
        `${formatQuantity(amount)} ${UNIT_LABELS[selected.baseUnit]} of ${selected.name} added. Now ${formatQuantity(result.onHand)} on hand.`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add stock');
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (event: React.FormEvent) => {
    event.preventDefault();

    if (selected === null) {
      return;
    }

    setError(null);
    setFlash(null);

    const amount = Number(delta);

    if (!Number.isFinite(amount) || amount === 0) {
      setError('Enter a quantity to add or remove. Use a minus sign to remove.');
      return;
    }

    if (reason.trim() === '') {
      setError('Say why the stock changed');
      return;
    }

    setBusy(true);

    try {
      const result = await api.adjustStock({
        itemId: selected.id,
        delta: amount,
        reason: reason.trim(),
      });
      setDelta('');
      setReason('');
      await refresh(
        selected.id,
        `${selected.name} adjusted. Now ${formatQuantity(result.onHand)} ${UNIT_LABELS[selected.baseUnit]} on hand.`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not adjust stock');
    } finally {
      setBusy(false);
    }
  };

  if (items === null) {
    return <p className="text-sm text-muted-foreground">Loading stock…</p>;
  }

  if (items.length === 0) {
    return (
      <div className={cardClass}>
        <h2 className="text-lg font-semibold">Add an item first</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stock belongs to an item. Create one on the Items tab, then receive its first lot here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Stock</h2>
        <p className="text-sm text-muted-foreground">
          Every change is a movement. Nothing is overwritten.
        </p>
      </div>

      <label className="space-y-1">
        <span className={labelClass}>Item</span>
        <select
          className={inputClass}
          value={selectedId ?? ''}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setFlash(null);
            setError(null);
          }}
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      {selected === null ? null : (
        <div className={`${cardClass} flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">On hand</p>
            <p className="text-3xl font-semibold">
              {formatQuantity(selected.stockOnHand)}{' '}
              <span className="text-base font-medium text-muted-foreground">
                {UNIT_LABELS[selected.baseUnit]}
              </span>
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Sells at {formatRupees(selected.sellPricePaise)}</p>
            <p>Buys at {formatRupees(selected.buyPricePaise)}</p>
            <p>Reorder at {formatQuantity(selected.reorderLevel)}</p>
          </div>
        </div>
      )}

      {flash === null ? null : (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {flash}
        </p>
      )}
      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <form className={`${cardClass} space-y-4`} onSubmit={(event) => void receive(event)}>
          <h3 className="text-base font-semibold">Stock in</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>
                Quantity {selected === null ? '' : `(${UNIT_LABELS[selected.baseUnit]})`}
              </span>
              <input
                className={inputClass}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="12"
              />
            </label>

            <label className="space-y-1">
              <span className={labelClass}>Buying price (₹, optional)</span>
              <input
                className={inputClass}
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                inputMode="decimal"
                placeholder={selected === null ? '25.00' : (selected.buyPricePaise / 100).toFixed(2)}
              />
            </label>

            <label className="space-y-1">
              <span className={labelClass}>Expiry date (optional)</span>
              <input
                type="date"
                className={inputClass}
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </label>

            <label className="space-y-1">
              <span className={labelClass}>Note (optional)</span>
              <input
                className={inputClass}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="New lot from distributor"
              />
            </label>
          </div>

          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? 'Saving…' : 'Add stock'}
          </button>
        </form>

        <form className={`${cardClass} space-y-4`} onSubmit={(event) => void adjust(event)}>
          <h3 className="text-base font-semibold">Adjust</h3>
          <p className="text-sm text-muted-foreground">
            Use a minus sign for damage, theft or a counting correction.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Change</span>
              <input
                className={inputClass}
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                inputMode="decimal"
                placeholder="-2"
              />
            </label>

            <label className="space-y-1">
              <span className={labelClass}>Reason</span>
              <input
                className={inputClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Damaged packets"
              />
            </label>
          </div>

          <button type="submit" className={secondaryButtonClass} disabled={busy}>
            {busy ? 'Saving…' : 'Record adjustment'}
          </button>
        </form>
      </div>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Recent movements</h3>

        {movements === null ? (
          <p className="text-sm text-muted-foreground">Loading movements…</p>
        ) : movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet for this item.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {movements.map((movement) => (
              <li key={movement.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {MOVEMENT_LABELS[movement.type]}
                    {movement.note === null ? '' : ` · ${movement.note}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(movement.createdAt)}
                    {movement.unitCostPaise === null
                      ? ''
                      : ` · ${formatRupees(movement.unitCostPaise)} per unit`}
                  </p>
                </div>
                <p
                  className={
                    movement.quantity < 0
                      ? 'text-sm font-semibold text-destructive'
                      : 'text-sm font-semibold text-primary'
                  }
                >
                  {movement.quantity > 0 ? '+' : ''}
                  {formatQuantity(movement.quantity)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
