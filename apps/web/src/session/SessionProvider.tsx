import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setAuthToken } from '../lib/api';
import { tokenStore } from '../lib/token-store';

export type AuthMode = 'setup' | 'unlock';

interface ShopSummary {
  id: string;
  name: string;
}

interface SessionState {
  status: 'loading' | 'signed-out' | 'signed-in';
  mode: AuthMode;
  shop: ShopSummary | null;
  ownerId: string | null;
}

interface SessionContextValue extends SessionState {
  setup(shopName: string, pin: string): Promise<void>;
  unlock(pin: string): Promise<void>;
  logout(): Promise<void>;
  requestUnlock(): void;
  requestSetup(): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const SIGNED_OUT: SessionState = { status: 'signed-out', mode: 'setup', shop: null, ownerId: null };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: 'loading',
    mode: 'setup',
    shop: null,
    ownerId: null,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [token, knownShop] = await Promise.all([
        tokenStore().read(),
        tokenStore().hasKnownShop(),
      ]);
      const mode: AuthMode = knownShop ? 'unlock' : 'setup';

      if (!token) {
        if (!cancelled) {
          setState({ ...SIGNED_OUT, mode });
        }
        return;
      }

      setAuthToken(token);

      try {
        const me = await api.me();
        if (!cancelled) {
          setState({ status: 'signed-in', mode: 'unlock', shop: me.shop, ownerId: me.owner.id });
        }
      } catch {
        setAuthToken(null);
        await tokenStore().clear();
        if (!cancelled) {
          setState({ ...SIGNED_OUT, mode: 'unlock' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback(async (session: { token: string; shop: ShopSummary; owner: { id: string } }) => {
    await tokenStore().write(session.token);
    await tokenStore().markKnownShop();
    setAuthToken(session.token);
    setState({
      status: 'signed-in',
      mode: 'unlock',
      shop: session.shop,
      ownerId: session.owner.id,
    });
  }, []);

  const setup = useCallback(
    async (shopName: string, pin: string) => {
      await adopt(await api.setup(shopName, pin));
    },
    [adopt],
  );

  const unlock = useCallback(
    async (pin: string) => {
      await adopt(await api.unlock(pin, deviceLabel()));
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
    } finally {
      setAuthToken(null);
      await tokenStore().clear();
      setState({ ...SIGNED_OUT, mode: 'unlock' });
    }
  }, []);

  const requestUnlock = useCallback(() => {
    void tokenStore().markKnownShop();
    setState((current) => ({ ...current, mode: 'unlock' }));
  }, []);

  const requestSetup = useCallback(() => {
    setState((current) => ({ ...current, mode: 'setup' }));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, setup, unlock, logout, requestUnlock, requestSetup }),
    [state, setup, unlock, logout, requestUnlock, requestSetup],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return value;
}

function deviceLabel(): string {
  const platform = navigator.userAgent.match(/Android|iPhone|iPad|Windows|Macintosh|Linux/);
  return platform?.[0] ?? 'browser';
}
