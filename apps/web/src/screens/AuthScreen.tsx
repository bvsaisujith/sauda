import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useSession } from '../session/SessionProvider';

const PIN_PATTERN = /^\d{4,8}$/;

export default function AuthScreen() {
  const { mode, setup, unlock, requestUnlock, requestSetup } = useSession();
  const [shopName, setShopName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const shopId = useId();
  const pinId = useId();
  const pinRef = useRef<HTMLInputElement>(null);

  const isSetup = mode === 'setup';
  const remainingSeconds =
    lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = remainingSeconds > 0;

  useEffect(() => {
    if (lockedUntil === null) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [lockedUntil]);

  useEffect(() => {
    if (!isSetup) {
      pinRef.current?.focus();
    }
  }, [isSetup]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);

    if (!PIN_PATTERN.test(pin)) {
      setMessage('PIN must be 4 to 8 digits.');
      return;
    }

    if (isSetup && shopName.trim().length === 0) {
      setMessage('Enter your shop name.');
      return;
    }

    setBusy(true);

    try {
      if (isSetup) {
        await setup(shopName.trim(), pin);
      } else {
        await unlock(pin);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'already-setup') {
          requestUnlock();
          setMessage('This shop already has a PIN. Enter it to unlock.');
        } else if (error.code === 'setup-required') {
          setMessage('No PIN is set up yet. Set up this shop first.');
        } else if (error.code === 'locked' && error.retryAfterSeconds !== undefined) {
          setLockedUntil(Date.now() + error.retryAfterSeconds * 1000);
          setNow(Date.now());
          setMessage(`Too many attempts. Try again in ${formatSeconds(error.retryAfterSeconds)}.`);
        } else if (error.code === 'invalid-pin') {
          setMessage('That PIN is not correct.');
          setPin('');
          pinRef.current?.focus();
        } else {
          setMessage(error.message);
        }
      } else {
        setMessage('Could not reach the shop server. Check the connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            Shop manager
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            {isSetup ? 'Set up Sauda' : 'Unlock Sauda'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isSetup
              ? 'Name your shop and choose a PIN. This device stays signed in until you sign out.'
              : 'Enter your owner PIN. Every change still needs your approval.'}
          </p>
        </header>

        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          {isSetup ? (
            <div className="space-y-2">
              <label htmlFor={shopId} className="text-sm font-medium text-foreground">
                Shop name
              </label>
              <input
                id={shopId}
                value={shopName}
                onChange={(event) => {
                  setShopName(event.target.value);
                }}
                autoComplete="organization"
                autoFocus
                maxLength={80}
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-base text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="e.g. Sri Lakshmi Kirana"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor={pinId} className="text-sm font-medium text-foreground">
              {isSetup ? 'Choose a PIN' : 'PIN'}
            </label>
            <input
              id={pinId}
              ref={pinRef}
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
              }}
              type="password"
              inputMode="numeric"
              pattern="\d*"
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              maxLength={8}
              className="w-full rounded-xl border border-border bg-input px-4 py-4 text-center text-3xl tracking-[0.4em] text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
              placeholder="••••"
              aria-describedby={`${pinId}-hint`}
            />
            <p id={`${pinId}-hint`} className="text-xs text-muted-foreground">
              4 to 8 digits. Five wrong attempts lock the PIN for 15 minutes.
            </p>
          </div>

          <div aria-live="polite" className="min-h-6">
            {message ? (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={busy || locked}
            className="w-full rounded-xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {busy ? 'Please wait…' : locked ? `Locked · ${remainingSeconds}s` : isSetup ? 'Create shop' : 'Unlock'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMessage(null);
            if (isSetup) {
              requestUnlock();
            } else {
              requestSetup();
            }
          }}
          className="self-center text-sm text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
        >
          {isSetup ? 'Already set up? Unlock with your PIN' : 'First time on this device? Set up your shop'}
        </button>
      </div>
    </main>
  );
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.ceil(seconds / 60)} min`;
}
