import type { ReactNode } from 'react';
import { secondaryButtonClass } from './ui';

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action === undefined ? null : <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }

  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function FlashNote({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }

  return (
    <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
      {message}
    </p>
  );
}

export function LoadingNote({ label }: { label: string }) {
  return (
    <div className="space-y-2" aria-busy="true">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="h-16 animate-pulse rounded-2xl border border-border bg-card/70" />
      <div className="h-16 animate-pulse rounded-2xl border border-border bg-card/70" />
    </div>
  );
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className={secondaryButtonClass} onClick={onClick}>
      {label}
    </button>
  );
}
