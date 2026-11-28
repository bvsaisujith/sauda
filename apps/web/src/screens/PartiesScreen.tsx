import { useCallback, useEffect, useState } from 'react';
import type { PartyType, PartyWithBalanceDto } from '@sauda/shared';
import { api, ApiError } from '../lib/api';
import { formatRupees } from '../lib/money';
import PartyFormScreen from './PartyFormScreen';
import { EmptyState, ErrorNote, LoadingNote } from '../components/states';
import { cardClass, inputClass, labelClass, primaryButtonClass } from '../components/ui';

export default function PartiesScreen({
  onOpenParty,
}: {
  onOpenParty: (partyId: string) => void;
}) {
  const [type, setType] = useState<PartyType>('customer');
  const [search, setSearch] = useState('');
  const [parties, setParties] = useState<PartyWithBalanceDto[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);

    try {
      setParties(await api.listParties({ type, search: search.trim() }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load parties');
    }
  }, [type, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (creating) {
    return (
      <PartyFormScreen
        type={type}
        onSaved={() => {
          setCreating(false);
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
          <h2 className="text-lg font-semibold">Suppliers and customers</h2>
          <p className="text-sm text-muted-foreground">
            Balances come from their bills, so they never drift.
          </p>
        </div>
        <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
          Add {type}
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
            {entry === 'customer' ? 'Customers' : 'Suppliers'}
          </button>
        ))}
      </div>

      <label className="space-y-1">
        <span className={labelClass}>Search</span>
        <input
          className={inputClass}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or phone"
        />
      </label>

      <ErrorNote message={error} />

      {parties === null ? (
        <LoadingNote label="Loading parties…" />
      ) : parties.length === 0 ? (
        <EmptyState
          title={`No ${type}s yet`}
          body={
            type === 'customer'
              ? 'Add a customer so their bills and payments can be tracked.'
              : 'Add a supplier so purchase bills and payables can be tracked.'
          }
          action={
            <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)}>
              Add your first {type}
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {parties.map((party) => {
            const balance =
              party.type === 'customer' ? party.receivablePaise : party.payablePaise;

            return (
              <li key={party.id}>
                <button
                  type="button"
                  onClick={() => onOpenParty(party.id)}
                  className={`${cardClass} w-full text-left transition hover:border-ring`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">{party.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {party.phone ?? 'No phone'}
                        {party.address === null ? '' : ` · ${party.address}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        {party.type === 'customer' ? 'To receive' : 'To pay'}
                      </p>
                      <p className="text-base font-semibold">{formatRupees(balance)}</p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
