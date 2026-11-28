import type { BillStatus } from '@sauda/shared';
import { BILL_STATUS_LABELS } from '@sauda/shared';

const STYLES: Record<BillStatus, string> = {
  unpaid: 'bg-destructive/10 text-destructive',
  partial: 'bg-accent/15 text-accent',
  paid: 'bg-primary/10 text-primary',
};

export default function StatusChip({ status }: { status: BillStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      {BILL_STATUS_LABELS[status]}
    </span>
  );
}
