"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  EventType,
  type AuthenticationResult,
  type EventMessage,
} from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { usePathname } from "next/navigation";

import type { PlatformUser } from "@/types/platform";

import {
  type AuthStatus,
  platformAuthService,
} from "@/lib/auth/platform-auth-service";
import { registerBearerTokenProvider } from "@/lib/auth/token-registry";

type AuthContextValue = {
  error: string | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  consumeReturnTo: (queryReturnTo?: string | null) => string;
  resolveReturnTo: (queryReturnTo?: string | null) => string;
  status: AuthStatus;
  user: PlatformUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const isAuthBypassEnabled = process.env.NEXT_PUBLIC_AUTH_BYPASS === "true";
const PUBLIC_SIGN_IN_UNAVAILABLE_MESSAGE =
  "Microsoft sign-in is temporarily unavailable. Please contact support.";

const AUTH_BYPASS_USER: PlatformUser = {
  id: "local-dev-user",
  entraObjectId: "local-dev-user",
  name: "Local Dev User",
  email: "local.dev@example.gov.uk",
  role: "Authenticated User",
  initials: "LD",
  team: "Local Development",
};

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  if (isAuthBypassEnabled) {
    return <AuthBypassProvider>{children}</AuthBypassProvider>;
  }

  return (
    <MsalProvider instance={platformAuthService.msalInstance}>
      <AuthStateProvider>{children}</AuthStateProvider>
    </MsalProvider>
  );
}

function AuthBypassProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerBearerTokenProvider(async () => "local-dev-auth-bypass-token");

    return () => {
      registerBearerTokenProvider(null);
    };
  }, []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      error: null,
      isAuthenticated: true,
      isReady: true,
      login: async () => undefined,
      logout: async () => undefined,
      consumeReturnTo: (queryReturnTo) => queryReturnTo || "/",
      resolveReturnTo: (queryReturnTo) => queryReturnTo || "/",
      status: "authenticated",
      user: AUTH_BYPASS_USER,
    }),
    [],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PlatformUser | null>(null);

  const isAuthenticated = status === "authenticated" && Boolean(user);
  const isReady =
    status !== "initializing" &&
    status !== "authenticating" &&
    status !== "validating-user";

  const registerAuthenticatedTokenProvider = useCallback(() => {
    registerBearerTokenProvider(async () => {
      try {
        return await platformAuthService.getAccessToken();
      } catch {
        setStatus("signed-out");
        setError(null);
        return null;
      }
    });
  }, []);

  const clearAuthenticatedTokenProvider = useCallback(() => {
    registerBearerTokenProvider(null);
  }, []);

  const bootstrap = useCallback(async () => {
    setStatus((currentStatus) =>
      currentStatus === "authenticated" ? "validating-user" : "initializing",
    );
    setError(null);

    const account = platformAuthService.getActiveAccount();

    if (account) {
      setStatus("validating-user");
    }

    const result = await platformAuthService.bootstrap();

    if (result.status === "authenticated") {
      registerAuthenticatedTokenProvider();
    } else {
      clearAuthenticatedTokenProvider();
    }

    setStatus(result.status);
    setUser(result.user);
    setError(result.error);
  }, [clearAuthenticatedTokenProvider, registerAuthenticatedTokenProvider]);

  const login = useCallback(async (returnTo?: string) => {
    const redirectTo = returnTo || buildCurrentPath(pathname);

    setStatus("authenticating");
    setError(null);
    try {
      await platformAuthService.login(redirectTo);
    } catch (error) {
      console.error("[auth] login_failed", error);
      setStatus("error");
      setError(error instanceof Error ? error.message : PUBLIC_SIGN_IN_UNAVAILABLE_MESSAGE);
    }
  }, [pathname]);

  const logout = useCallback(async () => {
    setStatus("signed-out");
    setError(null);
    setUser(null);
    clearAuthenticatedTokenProvider();
    await platformAuthService.logout();
  }, [clearAuthenticatedTokenProvider]);

  useEffect(() => {
    queueMicrotask(() => {
      void bootstrap();
    });
  }, [bootstrap]);

  useEffect(() => {
    const callbackId = platformAuthService.msalInstance.addEventCallback((event: EventMessage) => {
      if (
        event.eventType === EventType.LOGIN_SUCCESS ||
        event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS
      ) {
        const payload = event.payload as AuthenticationResult | null;

        if (payload?.account) {
          platformAuthService.setActiveAccount(payload.account);
        }

        if (event.eventType === EventType.LOGIN_SUCCESS) {
          void bootstrap();
        }
      }

      if (event.eventType === EventType.ACQUIRE_TOKEN_FAILURE) {
        setStatus("error");
        setError(event.error instanceof Error ? event.error.message : "Microsoft sign-in failed.");
      }
    });

    return () => {
      if (callbackId) {
        platformAuthService.msalInstance.removeEventCallback(callbackId);
      }
    };
  }, [bootstrap]);

  useEffect(() => {
    if (status === "signed-out" || status === "unauthorized" || status === "error") {
      clearAuthenticatedTokenProvider();
    }
  }, [clearAuthenticatedTokenProvider, status]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      error,
      isAuthenticated,
      isReady,
      login,
      logout,
      consumeReturnTo: (queryReturnTo) => platformAuthService.consumeReturnTo(queryReturnTo),
      resolveReturnTo: (queryReturnTo) => platformAuthService.resolveReturnTo(queryReturnTo),
      status,
      user,
    }),
    [error, isAuthenticated, isReady, login, logout, status, user],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

function buildCurrentPath(pathname: string) {
  if (typeof window === "undefined") {
    return pathname;
  }

  const currentQuery = window.location.search.slice(1);

  return `${pathname}${currentQuery ? `?${currentQuery}` : ""}`;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within ClientAuthProvider.");
  }

  return context;
}
