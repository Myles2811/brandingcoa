import {
  BrowserCacheLocation,
  type Configuration,
  InteractionRequiredAuthError,
  type AccountInfo,
  PublicClientApplication,
  type RedirectRequest,
} from "@azure/msal-browser";

import type { PlatformUser } from "@/types/platform";

import { AUTH_RETURN_TO_STORAGE_KEY } from "./auth-shared";
import { fetchBackendUser } from "./backend-user";

export type AuthStatus =
  | "initializing"
  | "signed-out"
  | "authenticating"
  | "validating-user"
  | "authenticated"
  | "unauthorized"
  | "error";

export type AuthBootstrapResult =
  | { status: "signed-out"; user: null; error: null }
  | { status: "authenticated"; user: PlatformUser; error: null }
  | { status: "unauthorized"; user: null; error: string }
  | { status: "error"; user: null; error: string };

const PUBLIC_SIGN_IN_UNAVAILABLE_MESSAGE =
  "Microsoft sign-in is temporarily unavailable. Please contact support.";

function getClientId() {
  return process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID || "missing-client-id";
}

function getTenantId() {
  return process.env.NEXT_PUBLIC_ENTRA_TENANT_ID || "organizations";
}

function getRedirectUri() {
  return process.env.NEXT_PUBLIC_ENTRA_REDIRECT_URI?.trim() || "http://localhost:3000/login";
}

function getPostLogoutRedirectUri() {
  return process.env.NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI?.trim() || "http://localhost:3000/login";
}

function createMsalInstance() {
  const msalConfig: Configuration = {
    auth: {
      clientId: getClientId(),
      authority: `https://login.microsoftonline.com/${getTenantId()}`,
      redirectUri: getRedirectUri(),
      postLogoutRedirectUri: getPostLogoutRedirectUri(),
    },
    cache: {
      cacheLocation: BrowserCacheLocation.SessionStorage,
    },
  };

  return new PublicClientApplication(msalConfig);
}

function getAuthConfigurationError() {
  if (!process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID) {
    return "Missing NEXT_PUBLIC_ENTRA_CLIENT_ID environment variable.";
  }

  if (!process.env.NEXT_PUBLIC_ENTRA_TENANT_ID) {
    return "Missing NEXT_PUBLIC_ENTRA_TENANT_ID environment variable.";
  }

  return null;
}

function logAuthIssue(event: string, detail: string) {
  console.error(`[auth] ${event}: ${detail}`);

  if (typeof window === "undefined") {
    return;
  }

  void fetch("/api/auth/client-log", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      event,
      detail,
      path: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export class AuthReturnToStore {
  constructor(private readonly storageKey = AUTH_RETURN_TO_STORAGE_KEY) {}

  set(value: string) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(this.storageKey, value);
  }

  get() {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(this.storageKey);
  }

  clear() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(this.storageKey);
  }

  resolve(queryReturnTo?: string | null, fallback = "/") {
    return queryReturnTo || this.get() || fallback;
  }
}

export class EntraAuthClient {
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly instance: PublicClientApplication) {}

  get msalInstance() {
    return this.instance;
  }

  getScopes() {
    const configuredScopes = process.env.NEXT_PUBLIC_ENTRA_SCOPES?.trim();
    const requiredScopes = ["openid", "profile", "email", "offline_access"];

    if (!configuredScopes) {
      return requiredScopes;
    }

    return Array.from(new Set([...configuredScopes.split(/\s+/), ...requiredScopes]));
  }

  initialize() {
    if (!this.initializePromise) {
      this.initializePromise = this.instance.initialize();
    }

    return this.initializePromise;
  }

  getActiveAccount() {
    return this.instance.getActiveAccount() ?? this.instance.getAllAccounts()[0] ?? null;
  }

  setActiveAccount(account: AccountInfo) {
    this.instance.setActiveAccount(account);
  }

  async loginRedirect(returnTo: string) {
    await this.initialize();
    await this.instance.loginRedirect(this.createLoginRequest(returnTo));
  }

  async logoutRedirect(account?: AccountInfo | null) {
    await this.initialize();
    await this.instance.logoutRedirect({
      account: account ?? undefined,
    });
  }

  async acquireAccessToken() {
    await this.initialize();

    const account = this.getActiveAccount();

    if (!account) {
      return null;
    }

    this.setActiveAccount(account);

    const result = await this.instance.acquireTokenSilent({
      account,
      scopes: this.getScopes(),
    });

    return result.accessToken;
  }

  isInteractionRequiredError(error: unknown) {
    return error instanceof InteractionRequiredAuthError;
  }

  private createLoginRequest(returnTo: string): RedirectRequest {
    return {
      scopes: this.getScopes(),
      redirectStartPage: returnTo,
    };
  }
}

export class BackendAuthClient {
  async me(accessToken: string) {
    return fetchBackendUser(accessToken);
  }
}

export class PlatformAuthService {
  constructor(
    private readonly entraClient: EntraAuthClient,
    private readonly backendClient: BackendAuthClient,
    private readonly returnToStore: AuthReturnToStore,
  ) {}

  get msalInstance() {
    return this.entraClient.msalInstance;
  }

  async initialize() {
    await this.entraClient.initialize();
  }

  getActiveAccount() {
    return this.entraClient.getActiveAccount();
  }

  setActiveAccount(account: AccountInfo) {
    this.entraClient.setActiveAccount(account);
  }

  async login(returnTo: string) {
    const configurationError = getAuthConfigurationError();

    if (configurationError) {
      logAuthIssue("entra_configuration_missing", configurationError);
      throw new Error(PUBLIC_SIGN_IN_UNAVAILABLE_MESSAGE);
    }

    this.returnToStore.set(returnTo);
    await this.entraClient.loginRedirect(returnTo);
  }

  async logout() {
    const account = this.getActiveAccount();
    this.returnToStore.clear();
    await this.entraClient.logoutRedirect(account);
  }

  async getAccessToken() {
    return this.entraClient.acquireAccessToken();
  }

  async bootstrap(): Promise<AuthBootstrapResult> {
    try {
      const configurationError = getAuthConfigurationError();

      if (configurationError) {
        logAuthIssue("entra_configuration_missing", configurationError);
        return { status: "signed-out", user: null, error: null };
      }

      await this.initialize();

      const account = this.getActiveAccount();

      if (!account) {
        return { status: "signed-out", user: null, error: null };
      }

      const accessToken = await this.getAccessToken();

      if (!accessToken) {
        return { status: "signed-out", user: null, error: null };
      }

      const user = await this.backendClient.me(accessToken);

      if (!user) {
        return {
          status: "unauthorized",
          user: null,
          error: "Your Microsoft account is signed in, but it is not authorized for Rebate Intelligence.",
        };
      }

      return { status: "authenticated", user, error: null };
    } catch (error) {
      if (this.entraClient.isInteractionRequiredError(error)) {
        return { status: "signed-out", user: null, error: null };
      }

      return {
        status: "error",
        user: null,
        error: PUBLIC_SIGN_IN_UNAVAILABLE_MESSAGE,
      };
    }
  }

  resolveReturnTo(queryReturnTo?: string | null) {
    return this.returnToStore.resolve(queryReturnTo);
  }

  consumeReturnTo(queryReturnTo?: string | null) {
    const returnTo = this.resolveReturnTo(queryReturnTo);
    this.returnToStore.clear();
    return returnTo;
  }
}

export const authReturnToStore = new AuthReturnToStore();
export const entraAuthClient = new EntraAuthClient(createMsalInstance());
export const backendAuthClient = new BackendAuthClient();
export const platformAuthService = new PlatformAuthService(
  entraAuthClient,
  backendAuthClient,
  authReturnToStore,
);
