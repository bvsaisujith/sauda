import { useEffect, useMemo, useState } from 'react';
import type {
  ItemWithStockDto,
  OrderInput,
  OrderWithPartyDto,
  PartyType,
  PartyWithBalanceDto,
} from '@sauda/shared';
import { PARTY_TYPE_LABELS, UNIT_LABELS } from '@sauda/shared';
import { api, ApiError, type ComposedBill } from '../lib/api';
import { formatQuantity, formatRupees, rupeesToPaise, todayIso } from '../lib/money';
import {
  cardClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui';

interface LineDraft {
  key: string;
  itemId: string;
  quantity: string;
  rate: string;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

function defaultRatePaise(item: ItemWithStockDto | undefined, type: PartyType): number {
  if (item === undefined) {
    return 0;
  }

  return type === 'customer' ? item.sellPricePaise : item.buyPricePaise;
}

function rateText(paise: number): string {
  return paise === 0 ? '' : (paise / 100).toString();
}

export default function OrderFormScreen({
  type,
  initial,
  defaultParty,
  onSaved,
  onCancel,
}: {
  type: PartyType;
  initial?: OrderWithPartyDto;
  defaultParty?: { id: string; name: string };
  onSaved: (result: { order: OrderWithPartyDto; bill?: ComposedBill }) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<ItemWithStockDto[] | null>(null);
  const [parties, setParties] = useState<PartyWithBalanceDto[] | null>(null);
  const [partyId, setPartyId] = useState(initial?.partyId ?? defaultParty?.id ?? '');
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    initial === undefined
      ? [{ key: newKey(), itemId: '', quantity: '1', rate: '' }]
      : initial.lines.map((line) => ({
          key: line.id,
          itemId: line.itemId,
          quantity: formatQuantity(line.quantity),
          rate: rateText(line.ratePaise),
        })),
  );
  const [showNewParty, setShowNewParty] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([api.listItems(), api.listParties({ type })])
      .then(([itemList, partyList]) => {
        if (cancelled) {
          return;
        }

        setItems(itemList);
        setParties(partyList);

        if (initial === undefined && partyList.length > 0) {
          setPartyId((current) => (current === '' ? partyList[0]!.id : current));
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof ApiError ? cause.message : 'Could not load items and parties');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [type, initial]);

  const totalPaise = useMemo(
    () =>
      lines.reduce((total, line) => {
        const quantity = Number(line.quantity);
        const rate = rupeesToPaise(line.rate);

        if (!Number.isFinite(quantity) || quantity <= 0 || rate === null) {
          return total;
        }

        return total + Math.round(quantity * rate);
      }, 0),
    [lines],
  );

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const chooseItem = (key: string, itemId: string) => {
    const item = items?.find((entry) => entry.id === itemId);
    updateLine(key, { itemId, rate: rateText(defaultRatePaise(item, type)) });
  };

  const addLine = () => {
    const first = items?.[0];
    setLines((current) => [
      ...current,
      {
        key: newKey(),
        itemId: first?.id ?? '',
        quantity: '1',
        rate: rateText(defaultRatePaise(first, type)),
      },
    ]);
  };

  const removeLine = (key: string) => {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.key !== key)));
  };

  const createParty = async () => {
    if (newPartyName.trim() === '') {
      setError('Enter the party name');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const created = await api.createParty({
        type,
        name: newPartyName.trim(),
        phone: newPartyPhone.trim() === '' ? null : newPartyPhone.trim(),
        address: null,
        notes: null,
      });
      setParties((current) => [...(current ?? []), created]);
      setPartyId(created.id);
      setNewPartyName('');
      setNewPartyPhone('');
      setShowNewParty(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not add the party');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (fulfil: boolean) => {
    setError(null);

    if (partyId === '') {
      setError(`Choose a ${PARTY_TYPE_LABELS[type].toLowerCase()}`);
      return;
    }

    const parsedLines = lines.map((line) => {
      const quantity = Number(line.quantity);
      const ratePaise = rupeesToPaise(line.rate);
      return { itemId: line.itemId, quantity, ratePaise };
    });

    if (parsedLines.some((line) => line.itemId === '')) {
      setError('Choose an item on every line');
      return;
    }

    if (parsedLines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
      setError('Every line needs a quantity greater than zero');
      return;
    }

    if (parsedLines.some((line) => line.ratePaise === null)) {
      setError('Enter a valid rate on every line');
      return;
    }

    const input: OrderInput = {
      type,
      partyId,
      orderDate,
      notes: notes.trim() === '' ? null : notes.trim(),
      lines: parsedLines.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        ratePaise: line.ratePaise as number,
      })),
      fulfil,
    };

    setBusy(true);

    try {
      if (initial === undefined) {
        onSaved(await api.createOrder(input));
      } else {
        const order = await api.updateOrder(initial.id, {
          partyId,
          orderDate,
          notes: input.notes,
          lines: input.lines,
          version: initial.version,
        });
        onSaved({ order });
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save the order');
    } finally {
      setBusy(false);
    }
  };

  const partyOptions = parties ?? [];

  return (
    <form
      className={`${cardClass} space-y-5`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {initial === undefined ? `New ${type} order` : 'Edit order'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {type === 'customer'
              ? 'Selling to a customer. Fulfilling sends stock out.'
              : 'Buying from a supplier. Fulfilling brings stock in.'}
          </p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>

      {items !== null && items.length === 0 ? (
        <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
          Add an item on the Stock tab before creating an order.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelClass}>{PARTY_TYPE_LABELS[type]}</span>
          <div className="flex gap-2">
            <select
              className={inputClass}
              value={partyId}
              onChange={(event) => setPartyId(event.target.value)}
            >
              <option value="">Choose…</option>
              {initial !== undefined && !partyOptions.some((party) => party.id === initial.partyId) ? (
                <option value={initial.partyId}>{initial.partyName}</option>
              ) : null}
              {defaultParty !== undefined &&
              !partyOptions.some((party) => party.id === defaultParty.id) ? (
                <option value={defaultParty.id}>{defaultParty.name}</option>
              ) : null}
              {partyOptions.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setShowNewParty((current) => !current)}
            >
              Add
            </button>
          </div>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Order date</span>
          <input
            type="date"
            className={inputClass}
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
        </label>
      </div>

      {showNewParty ? (
        <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className={inputClass}
            value={newPartyName}
            onChange={(event) => setNewPartyName(event.target.value)}
            placeholder="Name"
          />
          <input
            className={inputClass}
            value={newPartyPhone}
            onChange={(event) => setNewPartyPhone(event.target.value)}
            placeholder="Phone (optional)"
            inputMode="tel"
          />
          <button type="button" className={primaryButtonClass} onClick={() => void createParty()} disabled={busy}>
            Save party
          </button>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Lines</h3>
          <button type="button" className={secondaryButtonClass} onClick={addLine} disabled={items === null}>
            Add line
          </button>
        </div>

        {items === null ? (
          <p className="text-sm text-muted-foreground">Loading items…</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((line) => {
              const item = items.find((entry) => entry.id === line.itemId);
              const quantity = Number(line.quantity);
              const rate = rupeesToPaise(line.rate);
              const lineTotal =
                Number.isFinite(quantity) && quantity > 0 && rate !== null
                  ? Math.round(quantity * rate)
                  : 0;

              return (
                <li key={line.key} className="rounded-xl border border-border p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_6rem_7rem_auto]">
                    <label className="space-y-1">
                      <span className={labelClass}>Item</span>
                      <select
                        className={inputClass}
                        value={line.itemId}
                        onChange={(event) => chooseItem(line.key, event.target.value)}
                      >
                        <option value="">Choose…</option>
                        {items.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className={labelClass}>
                        Qty {item === undefined ? '' : `(${UNIT_LABELS[item.baseUnit]})`}
                      </span>
                      <input
                        className={inputClass}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        inputMode="decimal"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className={labelClass}>Rate (₹)</span>
                      <input
                        className={inputClass}
                        value={line.rate}
                        onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                        inputMode="decimal"
                      />
                    </label>

                    <div className="flex items-end justify-between gap-2">
                      <div className="pb-2 text-right">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
                        <p className="text-sm font-semibold">{formatRupees(lineTotal)}</p>
                      </div>
                      <button
                        type="button"
                        className={dangerButtonClass}
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="space-y-1">
        <span className={labelClass}>Notes (optional)</span>
        <input
          className={inputClass}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Deliver tomorrow morning"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">
          Order total <span className="text-base font-semibold text-foreground">{formatRupees(totalPaise)}</span>
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={secondaryButtonClass} disabled={busy}>
            {busy ? 'Saving…' : 'Save as pending'}
          </button>
          {initial !== undefined && initial.status === 'fulfilled' ? null : (
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => void submit(true)}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save and fulfil'}
            </button>
          )}
        </div>
      </div>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
