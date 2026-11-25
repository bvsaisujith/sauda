import { useCallback, useEffect, useState } from 'react';
import { UNIT_LABELS, unitSchema, type ItemInput, type ItemWithStockDto, type Unit } from '@sauda/shared';
import { api, ApiError } from '../lib/api';
import { formatQuantity, formatRupees, rupeesToPaise } from '../lib/money';
import {
  cardClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui';

const UNITS = unitSchema.options;
const GST_RATES = [0, 5, 12, 18, 28];

interface ItemFormProps {
  initial?: ItemWithStockDto;
  onSaved: (item: ItemWithStockDto) => void;
  onArchived: () => void;
  onCancel: () => void;
}

function ItemForm({ initial, onSaved, onArchived, onCancel }: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [baseUnit, setBaseUnit] = useState<Unit>(initial?.baseUnit ?? 'piece');
  const [sellPrice, setSellPrice] = useState(
    initial === undefined ? '' : (initial.sellPricePaise / 100).toString(),
  );
  const [buyPrice, setBuyPrice] = useState(
    initial === undefined ? '' : (initial.buyPricePaise / 100).toString(),
  );
  const [reorderLevel, setReorderLevel] = useState(
    initial === undefined ? '0' : formatQuantity(initial.reorderLevel),
  );
  const [gstRate, setGstRate] = useState(initial?.gstRate ?? 0);
  const [hsnCode, setHsnCode] = useState(initial?.hsnCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const sellPaise = rupeesToPaise(sellPrice);
    const buyPaise = rupeesToPaise(buyPrice);

    if (name.trim() === '') {
      setError('Enter the item name');
      return;
    }

    if (sellPaise === null) {
      setError('Enter a selling price in rupees');
      return;
    }

    if (buyPaise === null) {
      setError('Enter a buying price in rupees');
      return;
    }

    const input: ItemInput = {
      name: name.trim(),
      baseUnit,
      sellPricePaise: sellPaise,
      buyPricePaise: buyPaise,
      reorderLevel: Number(reorderLevel) || 0,
      gstRate,
      hsnCode: hsnCode.trim() === '' ? null : hsnCode.trim(),
    };

    setBusy(true);

    try {
      const saved =
        initial === undefined
          ? await api.createItem(input)
          : await api.updateItem(initial.id, input);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save the item');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (initial === undefined) {
      return;
    }

    if (!window.confirm(`Archive ${initial.name}? Its stock history stays.`)) {
      return;
    }

    setBusy(true);

    try {
      await api.archiveItem(initial.id);
      onArchived();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not archive the item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`${cardClass} space-y-4`} onSubmit={(event) => void submit(event)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{initial === undefined ? 'New item' : 'Edit item'}</h2>
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={busy}>
          Close
        </button>
      </div>

      <label className="space-y-1">
        <span className={labelClass}>Item name</span>
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Tata Salt 1kg"
          autoFocus
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelClass}>Sold by</span>
          <select
            className={inputClass}
            value={baseUnit}
            onChange={(event) => setBaseUnit(event.target.value as Unit)}
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>GST rate</span>
          <select
            className={inputClass}
            value={gstRate}
            onChange={(event) => setGstRate(Number(event.target.value))}
          >
            {GST_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate === 0 ? 'No GST' : `${rate}%`}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Selling price (₹)</span>
          <input
            className={inputClass}
            value={sellPrice}
            onChange={(event) => setSellPrice(event.target.value)}
            inputMode="decimal"
            placeholder="28.00"
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Buying price (₹)</span>
          <input
            className={inputClass}
            value={buyPrice}
            onChange={(event) => setBuyPrice(event.target.value)}
            inputMode="decimal"
            placeholder="25.00"
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Reorder level</span>
          <input
            className={inputClass}
            value={reorderLevel}
            onChange={(event) => setReorderLevel(event.target.value)}
            inputMode="decimal"
            placeholder="6"
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>HSN code (optional)</span>
          <input
            className={inputClass}
            value={hsnCode}
            onChange={(event) => setHsnCode(event.target.value)}
            placeholder="2501"
          />
        </label>
      </div>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? 'Saving…' : initial === undefined ? 'Add item' : 'Save changes'}
        </button>
        {initial === undefined ? null : (
          <button type="button" className={dangerButtonClass} onClick={() => void archive()} disabled={busy}>
            Archive
          </button>
        )}
      </div>
    </form>
  );
}

export default function ItemsScreen() {
  const [items, setItems] = useState<ItemWithStockDto[] | null>(null);
  const [editor, setEditor] = useState<{ kind: 'create' } | { kind: 'edit'; item: ItemWithStockDto } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);

    try {
      setItems(await api.listItems());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load items');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const closeEditor = () => {
    setEditor(null);
    void reload();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Items and prices</h2>
          <p className="text-sm text-muted-foreground">Prices are per unit you sell in.</p>
        </div>
        <button type="button" className={primaryButtonClass} onClick={() => setEditor({ kind: 'create' })}>
          Add item
        </button>
      </div>

      {editor === null ? null : (
        <ItemForm
          {...(editor.kind === 'edit' ? { initial: editor.item } : {})}
          onSaved={() => closeEditor()}
          onArchived={() => closeEditor()}
          onCancel={() => setEditor(null)}
        />
      )}

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading items…</p>
      ) : items.length === 0 ? (
        <div className={cardClass}>
          <h3 className="text-base font-semibold">No items yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first item with its selling price, buying price and reorder level.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const low = item.reorderLevel > 0 && item.stockOnHand <= item.reorderLevel;

            return (
              <li key={item.id} className={`${cardClass} flex flex-wrap items-center justify-between gap-4`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold">{item.name}</h3>
                    {low ? (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        Reorder
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatRupees(item.sellPricePaise)} per {UNIT_LABELS[item.baseUnit]} · buys at{' '}
                    {formatRupees(item.buyPricePaise)}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">On hand</p>
                    <p className="text-base font-semibold">
                      {formatQuantity(item.stockOnHand)} {UNIT_LABELS[item.baseUnit]}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setEditor({ kind: 'edit', item })}
                  >
                    Edit
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
