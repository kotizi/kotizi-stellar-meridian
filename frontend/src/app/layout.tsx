import type { Metadata } from "next";

import { fontVariables } from "./fonts";
import { AppProviders } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "kotizi — your own home, no down payment.",
  description:
    "A digital buying group for your home: pay an installment before every draw, get contemplated, and your credit value goes to the property. Transparent by design.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
