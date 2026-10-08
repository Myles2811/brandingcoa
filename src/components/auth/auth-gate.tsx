"use client";

import { startTransition, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "./client-auth-provider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { error, isAuthenticated, isReady, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isReady || isAuthenticated || status === "unauthorized" || status === "error") {
      return;
    }

    const query = window.location.search.slice(1);
    const returnTo = `${pathname}${query ? `?${query}` : ""}`;

    startTransition(() => {
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    });
  }, [isAuthenticated, isReady, pathname, router, status]);

  if (status === "unauthorized") {
    return <AuthMessage title="Access not available" message={error ?? "Your account is not authorized for this application."} />;
  }

  if (status === "error") {
    return <AuthMessage title="Unable to verify access" message={error ?? "Your Microsoft session could not be verified."} />;
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
