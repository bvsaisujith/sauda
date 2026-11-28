import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummaryDto, PartyType } from '@sauda/shared';
import { api, ApiError, type BillWithParty } from '../lib/api';
import { formatDate, formatRupees } from '../lib/money';
import StatusChip from '../components/StatusChip';
import { EmptyState, ErrorNote, LoadingNote } from '../components/states';
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

type Filter = 'all' | PartyType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All bills' },
  { id: 'customer', label: 'Customer bills' },
  { id: 'supplier', label: 'Supplier bills' },
];

const STATUS_ORDER: Record<BillWithParty['status'], number> = { unpaid: 0, partial: 1, paid: 2 };

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint === undefined ? null : <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function DashboardScreen({
  onOpenBill,
  onGoOrders,
}: {
  onOpenBill: (billId: string) => void;
  onGoOrders: () => void;
}) {
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [bills, setBills] = useState<BillWithParty[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);

    try {
      const [nextSummary, nextBills] = await Promise.all([
        api.dashboardSummary(),
        api.listBills(),
      ]);
      setSummary(nextSummary);
      setBills(nextBills);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the dashboard');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible =
    bills === null
      ? null
      : bills
          .filter((bill) => filter === 'all' || bill.orderType === filter)
          .sort(
            (a, b) =>
              STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
              b.createdAt.localeCompare(a.createdAt),
          );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Today at the shop</h2>
          <p className="text-sm text-muted-foreground">
            Bills sorted so the money you are waiting on comes first.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => void reload()}>
            Refresh
          </button>
          <button type="button" className={primaryButtonClass} onClick={onGoOrders}>
            New order
          </button>
        </div>
      </div>

      <ErrorNote message={error} />

      {summary === null ? (
        <LoadingNote label="Loading today's totals…" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Sales today"
              value={formatRupees(summary.todaySalesPaise)}
              hint={`${summary.billCounts.unpaid + summary.billCounts.partial} open bills`}
            />
            <SummaryCard
              label="Purchases today"
              value={formatRupees(summary.todayPurchasesPaise)}
              hint="Bills from suppliers"
            />
            <SummaryCard
              label="To receive"
              value={formatRupees(summary.receivablePaise)}
              hint="Customers owe you"
            />
            <SummaryCard
              label="To pay"
              value={formatRupees(summary.payablePaise)}
              hint="You owe suppliers"
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-destructive/10 px-3 py-1 font-semibold text-destructive">
              {summary.billCounts.unpaid} unpaid
            </span>
            <span className="rounded-full bg-accent/15 px-3 py-1 font-semibold text-accent">
              {summary.billCounts.partial} partially paid
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
              {summary.billCounts.paid} paid
            </span>
          </div>
        </>
      )}

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setFilter(entry.id)}
            className={
              filter === entry.id
                ? 'rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground'
                : 'rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground'
            }
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {visible === null ? (
        <LoadingNote label="Loading bills…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No bills yet"
          body="Fulfil an order to create its bill. Payments and balances then show up here."
          action={
            <button type="button" className={primaryButtonClass} onClick={onGoOrders}>
              Create your first order
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((bill) => (
            <li key={bill.id}>
              <button
                type="button"
                onClick={() => onOpenBill(bill.id)}
                className={`${cardClass} w-full text-left transition hover:border-ring`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{bill.partyName}</h3>
                      <StatusChip status={bill.status} />
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {bill.orderType === 'customer' ? 'Customer' : 'Supplier'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {bill.billNumber} · {formatDate(bill.createdAt.slice(0, 10))}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-base font-semibold">{formatRupees(bill.totalPaise)}</p>
                    <p className="text-xs text-muted-foreground">
                      {bill.balancePaise > 0
                        ? `${formatRupees(bill.balancePaise)} due`
                        : bill.balancePaise < 0
                          ? `${formatRupees(-bill.balancePaise)} advance`
                          : 'Settled'}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
