import type { Metadata } from "next";
import { AuthGate } from "@/components/auth/auth-gate";
import { ClientAuthProvider } from "@/components/auth/client-auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rebate Intelligence",
  description: "Award-to-rebate reconciliation and evidence dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClientAuthProvider>
          <AuthGate>{children}</AuthGate>
        </ClientAuthProvider>
      </body>
    </html>
  );
}
