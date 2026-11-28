/**
 * Prices travel as whole paise; the shopkeeper reads and types rupees.
 */

const rupeeFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRupees(paise: number): string {
  return rupeeFormat.format(paise / 100);
}

/** Returns null when the text is not a usable rupee amount. */
export function rupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');

  if (cleaned === '') {
    return null;
  }

  const value = Number(cleaned);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100);
}

export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Date-only values are sent as YYYY-MM-DD, so render them without a timezone shift. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso.slice(0, 10)}T00:00:00`));
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
