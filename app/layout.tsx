import type { Metadata } from "next";
import { Roboto_Condensed } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { AccountProvider } from "@/lib/account-context";
import { SessionProvider } from "@/components/SessionProvider";
import { BillingGuard } from "@/components/BillingGuard";
import { FormPersistenceProvider } from "@/components/FormPersistenceProvider";

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-roboto-condensed",
});

export const metadata: Metadata = {
  title: "Asset Organizer",
  description: "Marketing Asset Intelligence App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={robotoCondensed.variable}>
        <SessionProvider>
          <AccountProvider>
            <FormPersistenceProvider>
              <Navigation />
              <BillingGuard>
                {children}
              </BillingGuard>
              <Footer />
            </FormPersistenceProvider>
          </AccountProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
