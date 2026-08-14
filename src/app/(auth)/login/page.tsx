"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/client-auth-provider";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { consumeReturnTo, error: authError, isReady, login, resolveReturnTo, status } = useAuth();
  const returnTo = resolveReturnTo(searchParams.get("returnTo"));
  const error = searchParams.get("error");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    router.replace(consumeReturnTo(searchParams.get("returnTo")));
  }, [consumeReturnTo, router, searchParams, status]);

  return (
    <main className="min-h-screen bg-[#F4F7FB] text-[#101828]">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden border-r border-[#D9E2EF] bg-white lg:flex">
          <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-[#D9E2EF] bg-white px-4 py-2 text-sm text-[#475467] shadow-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Rebate Intelligence
            </div>

            <div className="max-w-2xl">
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.28em] text-[#2A64FF]">
                Secure internal access
              </p>
              <h1 className="text-4xl font-semibold leading-tight xl:text-5xl">
                Sign in to manage rebate reconciliation, exposure, and follow-up evidence.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#667085]">
                Authentication is handled through Microsoft Entra ID. Access is validated with the backend before the dashboard is opened.
              </p>
            </div>

            <div className="flex items-center gap-6 text-sm text-[#667085]">
              <span>Microsoft Entra ID</span>
              <span className="h-1 w-1 rounded-full bg-[#98A2B3]" />
              <span>Backend authorization check</span>
              <span className="h-1 w-1 rounded-full bg-[#98A2B3]" />
              <span>Protected dashboard</span>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="rounded-xl border border-[#D9E2EF] bg-white p-8 shadow-sm xl:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#2A64FF]">
                Rebate Intelligence
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Sign in
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#667085]">
                Use your organisation Microsoft account to access the rebate recovery cockpit.
              </p>

              <div className="mt-8 space-y-5">
                <div className="rounded-xl border border-[#D9E2EF] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#667085]">
                  Passwords and multi-factor authentication are managed by Microsoft Entra ID.
                </div>

                {error || authError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
                    {error || authError}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={!isReady}
                  onClick={() => {
                    void login(returnTo);
                  }}
                  className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#D0D5DD] bg-white px-4 text-sm font-semibold text-[#344054] transition hover:border-[#98A2B3] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg aria-hidden="true" viewBox="0 0 23 23" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1H10V10H1V1Z" fill="#F25022" />
                    <path d="M13 1H22V10H13V1Z" fill="#7FBA00" />
                    <path d="M1 13H10V22H1V13Z" fill="#00A4EF" />
                    <path d="M13 13H22V22H13V13Z" fill="#FFB900" />
                  </svg>
                  {isReady ? "Sign in with Microsoft" : "Preparing sign-in"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginPageFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-6 text-center text-[#101828]">
      <div className="w-full max-w-md rounded-xl border border-[#D9E2EF] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#2A64FF]">
          Rebate Intelligence
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Preparing sign-in
        </h1>
      </div>
    </main>
  );
}
