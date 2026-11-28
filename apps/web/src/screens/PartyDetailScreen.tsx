import { useCallback, useEffect, useState } from 'react';
import type { PartyWithBalanceDto } from '@sauda/shared';
import { api, ApiError, type BillWithParty } from '../lib/api';
import { formatDate, formatRupees } from '../lib/money';
import StatusChip from '../components/StatusChip';
import PartyFormScreen from './PartyFormScreen';
import { BackButton, ErrorNote, LoadingNote } from '../components/states';
import { cardClass, dangerButtonClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

export default function PartyDetailScreen({
  partyId,
  onBack,
  onOpenBill,
  onNewOrder,
}: {
  partyId: string;
  onBack: () => void;
  onOpenBill: (billId: string) => void;
  onNewOrder: (party: PartyWithBalanceDto) => void;
}) {
  const [party, setParty] = useState<PartyWithBalanceDto | null>(null);
  const [bills, setBills] = useState<BillWithParty[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);

    try {
      const detail = await api.getParty(partyId);
      setParty(detail.party);
      setBills(detail.bills);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the party');
    }
  }, [partyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = async () => {
    if (
      !window.confirm(
        'Delete this party? It is hidden from lists but stays on old bills. Open bills should be settled first.',
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      await api.archiveParty(partyId);
      onBack();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete the party');
    } finally {
      setBusy(false);
    }
  };

  if (editing && party !== null) {
    return (
      <PartyFormScreen
        type={party.type}
        initial={party}
        onSaved={() => {
          setEditing(false);
          void reload();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (party === null) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} label="Back to parties" />
        <ErrorNote message={error} />
        <LoadingNote label="Loading party…" />
      </div>
    );
  }

  const balance = party.type === 'customer' ? party.receivablePaise : party.payablePaise;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton onClick={onBack} label="Back to parties" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => onNewOrder(party)}
          >
            New order
          </button>
          <button type="button" className={dangerButtonClass} onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
        </div>
      </div>

      <ErrorNote message={error} />

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{party.name}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {party.type === 'customer' ? 'Customer' : 'Supplier'}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {party.phone ?? 'No phone'}
              {party.address === null ? '' : ` · ${party.address}`}
            </p>
            {party.notes === null ? null : (
              <p className="mt-1 text-sm text-muted-foreground">{party.notes}</p>
            )}
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {party.type === 'customer' ? 'To receive' : 'To pay'}
            </p>
            <p className="text-2xl font-semibold">{formatRupees(balance)}</p>
          </div>
        </div>

        {party.phone === null ? null : (
          <a
            href={`tel:${party.phone.replace(/[^0-9+]/g, '')}`}
            className={`${secondaryButtonClass} mt-4`}
          >
            Call {party.phone}
          </a>
        )}
      </div>

      <section className={`${cardClass} space-y-3`}>
        <h3 className="text-base font-semibold">Bills</h3>

        {bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bills yet. Create an order and fulfil it to make the first bill.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {bills.map((bill) => (
              <li key={bill.id}>
                <button
                  type="button"
                  onClick={() => onOpenBill(bill.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-medium">{bill.billNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(bill.createdAt.slice(0, 10))} · {bill.orderType}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{formatRupees(bill.totalPaise)}</span>
                    <StatusChip status={bill.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
