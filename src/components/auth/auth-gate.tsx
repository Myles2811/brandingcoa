"use client";

import { startTransition, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "./client-auth-provider";

const PUBLIC_PATHS = ["/login"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { error, isAuthenticated, isReady, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    if (isPublicPath || !isReady || isAuthenticated || status === "unauthorized") {
      return;
    }

    const query = window.location.search.slice(1);
    const returnTo = `${pathname}${query ? `?${query}` : ""}`;

    startTransition(() => {
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    });
  }, [isAuthenticated, isPublicPath, isReady, pathname, router, status]);

  if (isPublicPath) {
    return <>{children}</>;
  }

  if (status === "unauthorized") {
    return <AuthMessage title="Access not available" message={error ?? "Your account is not authorized for this application."} />;
  }

  if (!isReady || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

function AuthMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-6 text-center text-[#101828]">
      <div className="max-w-sm rounded-xl border border-[#D9E2EF] bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2A64FF]">
          Rebate Intelligence
        </p>
        <h1 className="mt-3 text-lg font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">{message}</p>
      </div>
    </div>
  );
}
