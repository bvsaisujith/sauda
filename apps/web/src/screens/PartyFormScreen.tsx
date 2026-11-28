import { useState } from 'react';
import type { PartyInput, PartyType, PartyWithBalanceDto } from '@sauda/shared';
import { PARTY_TYPE_LABELS } from '@sauda/shared';
import { api, ApiError } from '../lib/api';
import { cardClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

export default function PartyFormScreen({
  type,
  initial,
  onSaved,
  onCancel,
}: {
  type: PartyType;
  initial?: PartyWithBalanceDto;
  onSaved: (party: PartyWithBalanceDto) => void;
  onCancel: () => void;
}) {
  const [partyType, setPartyType] = useState<PartyType>(initial?.type ?? type);
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (name.trim() === '') {
      setError('Enter the name');
      return;
    }

    const input: PartyInput = {
      type: partyType,
      name: name.trim(),
      phone: phone.trim() === '' ? null : phone.trim(),
      address: address.trim() === '' ? null : address.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
    };

    setBusy(true);

    try {
      onSaved(
        initial === undefined
          ? await api.createParty(input)
          : await api.updateParty(initial.id, input),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save the party');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`${cardClass} space-y-4`} onSubmit={(event) => void submit(event)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {initial === undefined ? 'New party' : 'Edit party'}
        </h2>
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelClass}>Type</span>
          <select
            className={inputClass}
            value={partyType}
            onChange={(event) => setPartyType(event.target.value as PartyType)}
          >
            {(['customer', 'supplier'] as PartyType[]).map((entry) => (
              <option key={entry} value={entry}>
                {PARTY_TYPE_LABELS[entry]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ramesh Kirana"
            autoFocus
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Phone (optional)</span>
          <input
            className={inputClass}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="98765 43210"
            inputMode="tel"
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Address or area (optional)</span>
          <input
            className={inputClass}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Gandhi Nagar"
          />
        </label>
      </div>

      <label className="space-y-1">
        <span className={labelClass}>Notes (optional)</span>
        <input
          className={inputClass}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Pays on Fridays"
        />
      </label>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? 'Saving…' : initial === undefined ? 'Add party' : 'Save changes'}
      </button>
    </form>
  );
}
