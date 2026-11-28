import { useCallback, useEffect, useState } from 'react';
import type {
  BillDetailDto,
  BillPaymentDto,
  PaymentMode,
} from '@sauda/shared';
import { PAYMENT_MODE_LABELS, paymentModeSchema } from '@sauda/shared';
import { api, ApiError } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatQuantity,
  formatRupees,
  rupeesToPaise,
  todayIso,
} from '../lib/money';
import StatusChip from '../components/StatusChip';
import { BackButton, ErrorNote, FlashNote, LoadingNote } from '../components/states';
import {
  cardClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui';

const MODES = paymentModeSchema.options;

function PaymentForm({
  bill,
  initial,
  onSaved,
  onCancel,
}: {
  bill: BillDetailDto;
  initial?: BillPaymentDto;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const suggested = bill.balancePaise > 0 ? bill.balancePaise : 0;
  const [amount, setAmount] = useState(
    initial === undefined
      ? suggested === 0
        ? ''
        : (suggested / 100).toString()
      : (initial.amountPaise / 100).toString(),
  );
  const [paidOn, setPaidOn] = useState(initial?.paidOn ?? todayIso());
  const [mode, setMode] = useState<PaymentMode>(initial?.mode ?? 'cash');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const amountPaise = rupeesToPaise(amount);

    if (amountPaise === null || amountPaise <= 0) {
      setError('Enter an amount greater than zero');
      return;
    }

    setBusy(true);

    try {
      const payload = {
        amountPaise,
        paidOn,
        mode,
        note: note.trim() === '' ? null : note.trim(),
      };

      if (initial === undefined) {
        await api.addPayment(bill.id, payload);
      } else {
        await api.updatePayment(initial.id, { ...payload, version: initial.version });
      }

      onSaved(initial === undefined ? 'Payment recorded.' : 'Payment updated.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save the payment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`${cardClass} space-y-4`} onSubmit={(event) => void submit(event)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">
          {initial === undefined ? 'Add payment' : 'Edit payment'}
        </h3>
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={busy}>
          Close
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={labelClass}>Amount (₹)</span>
          <input
            className={inputClass}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="500.00"
            autoFocus
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Paid on</span>
          <input
            type="date"
            className={inputClass}
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Mode</span>
          <select
            className={inputClass}
            value={mode}
            onChange={(event) => setMode(event.target.value as PaymentMode)}
          >
            {MODES.map((entry) => (
              <option key={entry} value={entry}>
                {PAYMENT_MODE_LABELS[entry]}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Note (optional)</span>
          <input
            className={inputClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="UPI reference"
          />
        </label>
      </div>

      {error === null ? null : <p className="text-sm text-destructive">{error}</p>}

      <button type="submit" className={primaryButtonClass} disabled={busy}>
        {busy ? 'Saving…' : initial === undefined ? 'Record payment' : 'Save payment'}
      </button>
    </form>
  );
}

export default function BillDetailScreen({
  billId,
  onBack,
  onOpenOrder,
}: {
  billId: string;
  onBack: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const [bill, setBill] = useState<BillDetailDto | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.listAudit>>>([]);
  const [editor, setEditor] = useState<
    { kind: 'add' } | { kind: 'edit'; payment: BillPaymentDto } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);

    try {
      const [nextBill, entries] = await Promise.all([
        api.getBill(billId),
        api.listAudit({ entityType: 'Bill', entityId: billId, limit: 50 }),
      ]);
      setBill(nextBill);
      setHistory(entries);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the bill');
    }
  }, [billId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const deletePayment = async (payment: BillPaymentDto) => {
    if (!window.confirm(`Delete the ${formatRupees(payment.amountPaise)} payment?`)) {
      return;
    }

    setError(null);
    setBusy(true);

    try {
      await api.deletePayment(payment.id);
      setFlash('Payment deleted. The balance and status were recalculated.');
      await reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not delete the payment');
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (
      !window.confirm(
        'This bill is fully paid and closed. Reopening lets you edit it. Continue?',
      )
    ) {
      return;
    }

    setError(null);
    setBusy(true);

    try {
      await api.reopenBill(billId);
      setFlash('Bill reopened. It is editable again.');
      await reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not reopen the bill');
    } finally {
      setBusy(false);
    }
  };

  if (bill === null) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} />
        <ErrorNote message={error} />
        <LoadingNote label="Loading bill…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton onClick={onBack} label="Back to bills" />
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => void reload()}
          disabled={busy}
        >
          Refresh
        </button>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{bill.partyName}</h2>
              <StatusChip status={bill.status} />
              {bill.closed ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Closed
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {bill.billNumber} · {bill.orderType === 'customer' ? 'Customer bill' : 'Supplier bill'} ·{' '}
              {formatDate(bill.createdAt.slice(0, 10))}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{formatRupees(bill.totalPaise)}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Paid</dt>
            <dd className="mt-1 text-base font-semibold">{formatRupees(bill.paidPaise)}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Balance</dt>
            <dd className="mt-1 text-base font-semibold">
              {bill.balancePaise < 0
                ? `${formatRupees(-bill.balancePaise)} advance`
                : formatRupees(bill.balancePaise)}
            </dd>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">Payments</dt>
            <dd className="mt-1 text-base font-semibold">{bill.payments.length}</dd>
          </div>
        </dl>

        {bill.closed ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2">
            <p className="text-sm text-foreground">
              This bill is fully paid. Reopen it before changing payments.
            </p>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void reopen()}
              disabled={busy}
            >
              Reopen bill
            </button>
          </div>
        ) : null}
      </div>

      <ErrorNote message={error} />
      <FlashNote message={flash} />

      {editor === null || bill.closed ? null : (
        <PaymentForm
          bill={bill}
          {...(editor.kind === 'edit' ? { initial: editor.payment } : {})}
          onSaved={(message) => {
            setEditor(null);
            setFlash(message);
            void reload();
          }}
          onCancel={() => setEditor(null)}
        />
      )}

      <section className={`${cardClass} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Order lines</h3>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => onOpenOrder(bill.orderId)}
          >
            Open order
          </button>
        </div>

        <ul className="divide-y divide-border">
          {bill.order.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium">
                  {bill.order.itemNames?.[line.itemId] ?? 'Removed item'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatQuantity(line.quantity)} × {formatRupees(line.ratePaise)}
                </p>
              </div>
              <p className="text-sm font-semibold">{formatRupees(line.lineTotalPaise)}</p>
            </li>
          ))}
        </ul>

        <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
          <span>Order total</span>
          <span>{formatRupees(bill.order.totalPaise)}</span>
        </div>
      </section>

      <section className={`${cardClass} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Payments</h3>
          {bill.closed ? null : (
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => setEditor({ kind: 'add' })}
              disabled={busy}
            >
              Add payment
            </button>
          )}
        </div>

        {bill.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payments yet. The balance stays {formatRupees(bill.balancePaise)}.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {bill.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{formatRupees(payment.amountPaise)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payment.paidOn)} · {PAYMENT_MODE_LABELS[payment.mode]}
                    {payment.note === null ? '' : ` · ${payment.note}`}
                  </p>
                </div>

                {bill.closed ? null : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => setEditor({ kind: 'edit', payment })}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={dangerButtonClass}
                      onClick={() => void deletePayment(payment)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${cardClass} space-y-3`}>
        <h3 className="text-base font-semibold">History</h3>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((entry) => (
              <li key={entry.id} className="border-l-2 border-border pl-3">
                <p className="text-sm font-medium">{entry.operation}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(entry.createdAt)} · {entry.source.toLowerCase()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
