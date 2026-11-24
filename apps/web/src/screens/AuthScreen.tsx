import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useSession } from '../session/SessionProvider';

export default function AuthScreen() {
  const { mode, signIn, signUp, requestSignIn, requestSignUp } = useSession();
  const [shopName, setShopName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const shopId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const shopRef = useRef<HTMLInputElement>(null);

  const isSignUp = mode === 'signup';
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
    shopRef.current?.focus();
  }, [isSignUp]);

  function switchMode(): void {
    setMessage(null);
    setPassword('');
    setConfirm('');

    if (isSignUp) {
      requestSignIn();
    } else {
      requestSignUp();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);

    if (shopName.trim().length === 0) {
      setMessage('Enter your shop name.');
      return;
    }

    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }

    if (isSignUp) {
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        setMessage('Password must include at least one letter and one digit.');
        return;
      }

      if (password !== confirm) {
        setMessage('Both passwords must match.');
        return;
      }
    }

    setBusy(true);

    try {
      if (isSignUp) {
        await signUp(shopName.trim(), password);
      } else {
        await signIn(shopName.trim(), password);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'shop-exists') {
          setMessage('That shop name is already registered. Sign in instead.');
        } else if (error.code === 'invalid-credentials') {
          setMessage('Shop name or password is incorrect.');
          setPassword('');
        } else if (error.code === 'locked' && error.retryAfterSeconds !== undefined) {
          setLockedUntil(Date.now() + error.retryAfterSeconds * 1000);
          setNow(Date.now());
          setMessage(`Too many attempts. Try again in ${formatSeconds(error.retryAfterSeconds)}.`);
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
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 px-6 py-12">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Sauda</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {isSignUp ? 'Create your shop account' : 'Sign in to your shop'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isSignUp
              ? 'Pick a shop name and a password. Each shop keeps its own items, stock and bills.'
              : 'Enter the shop name and password you registered with.'}
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Account access"
          className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isSignUp}
            onClick={() => {
              if (isSignUp) {
                switchMode();
              }
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isSignUp
                ? 'text-muted-foreground hover:text-foreground'
                : 'bg-card text-card-foreground shadow-sm'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignUp}
            onClick={() => {
              if (!isSignUp) {
                switchMode();
              }
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              isSignUp
                ? 'bg-card text-card-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create account
          </button>
        </div>

        <form className="space-y-5" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <label htmlFor={shopId} className="text-sm font-medium text-foreground">
              Shop name
            </label>
            <input
              id={shopId}
              ref={shopRef}
              value={shopName}
              onChange={(event) => {
                setShopName(event.target.value);
              }}
              autoComplete="organization"
              maxLength={80}
              className="w-full rounded-xl border border-border bg-input px-4 py-3 text-base text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
              placeholder="e.g. Sri Lakshmi Kirana"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor={passwordId} className="text-sm font-medium text-foreground">
              Password
            </label>
            <div className="relative">
              <input
                id={passwordId}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                maxLength={64}
                className="w-full rounded-xl border border-border bg-input px-4 py-3 pr-20 text-base text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
                aria-describedby={`${passwordId}-hint`}
              />
              <button
                type="button"
                onClick={() => {
                  setShowPassword((current) => !current);
                }}
                className="absolute inset-y-0 right-0 px-4 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p id={`${passwordId}-hint`} className="text-xs text-muted-foreground">
              {isSignUp
                ? '8 or more characters with at least one letter and one digit.'
                : 'Your password is stored salted and is never shown to anyone.'}
            </p>
          </div>

          {isSignUp ? (
            <div className="space-y-2">
              <label htmlFor={confirmId} className="text-sm font-medium text-foreground">
                Confirm password
              </label>
              <input
                id={confirmId}
                value={confirm}
                onChange={(event) => {
                  setConfirm(event.target.value);
                }}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                maxLength={64}
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-base text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="Type the password again"
              />
            </div>
          ) : null}

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
            {busy
              ? 'Please wait…'
              : locked
                ? `Locked · ${remainingSeconds}s`
                : isSignUp
                  ? 'Create account'
                  : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={switchMode}
          className="self-center text-sm text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
        >
          {isSignUp ? 'Already have an account? Sign in' : 'New shop? Create an account'}
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