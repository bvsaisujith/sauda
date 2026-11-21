const TOKEN_KEY = 'sauda.device-token';
const KNOWN_SHOP_KEY = 'sauda.known-shop';

export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
  hasKnownShop(): Promise<boolean>;
  markKnownShop(): Promise<void>;
}

/**
 * Web driver. The Android shell swaps this for a Keystore-backed driver with
 * the same interface, so nothing above this file knows where the token lives.
 */
function createWebTokenStore(): TokenStore {
  return {
    async read() {
      return window.localStorage.getItem(TOKEN_KEY);
    },
    async write(token) {
      window.localStorage.setItem(TOKEN_KEY, token);
    },
    async clear() {
      window.localStorage.removeItem(TOKEN_KEY);
    },
    async hasKnownShop() {
      return window.localStorage.getItem(KNOWN_SHOP_KEY) === 'yes';
    },
    async markKnownShop() {
      window.localStorage.setItem(KNOWN_SHOP_KEY, 'yes');
    },
  };
}

let active: TokenStore = createWebTokenStore();

export function setTokenStore(store: TokenStore): void {
  active = store;
}

export function tokenStore(): TokenStore {
  return active;
}
