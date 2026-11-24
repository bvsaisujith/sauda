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

export type AuthMode = 'signin' | 'signup';

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
  signIn(shopName: string, password: string): Promise<void>;
  signUp(shopName: string, password: string): Promise<void>;
  logout(): Promise<void>;
  requestSignIn(): void;
  requestSignUp(): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const SIGNED_OUT: SessionState = {
  status: 'signed-out',
  mode: 'signin',
  shop: null,
  ownerId: null,
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    status: 'loading',
    mode: 'signin',
    shop: null,
    ownerId: null,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const token = await tokenStore().read();

      if (!token) {
        if (!cancelled) {
          setState({ ...SIGNED_OUT });
        }
        return;
      }

      setAuthToken(token);

      try {
        const me = await api.me();
        if (!cancelled) {
          setState({ status: 'signed-in', mode: 'signin', shop: me.shop, ownerId: me.owner.id });
        }
      } catch {
        setAuthToken(null);
        await tokenStore().clear();
        if (!cancelled) {
          setState({ ...SIGNED_OUT });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback(
    async (session: { token: string; shop: ShopSummary; owner: { id: string } }) => {
      await tokenStore().write(session.token);
      setAuthToken(session.token);
      setState({
        status: 'signed-in',
        mode: 'signin',
        shop: session.shop,
        ownerId: session.owner.id,
      });
    },
    [],
  );

  const signIn = useCallback(
    async (shopName: string, password: string) => {
      await adopt(await api.signIn(shopName, password, deviceLabel()));
    },
    [adopt],
  );

  const signUp = useCallback(
    async (shopName: string, password: string) => {
      await adopt(await api.signUp(shopName, password));
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
      setState({ ...SIGNED_OUT });
    }
  }, []);

  const requestSignIn = useCallback(() => {
    setState((current) => ({ ...current, mode: 'signin' }));
  }, []);

  const requestSignUp = useCallback(() => {
    setState((current) => ({ ...current, mode: 'signup' }));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, signIn, signUp, logout, requestSignIn, requestSignUp }),
    [state, signIn, signUp, logout, requestSignIn, requestSignUp],
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