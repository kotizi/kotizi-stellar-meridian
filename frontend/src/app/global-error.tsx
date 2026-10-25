"use client";

import { useEffect } from "react";

import { fontVariables } from "./fonts";
import "./globals.css";

// Replaces the root layout when it crashes: it brings its own styles and fonts; no providers or app state here.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className={`dark ${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas text-primary">
        <title>kotizi — something went wrong</title>
        <main role="alert" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="type-h3">Something went wrong.</h1>
            <p className="type-body-md text-secondary">kotizi couldn&apos;t be loaded. Please try again.</p>
          </div>
          <button
            type="button"
            onClick={() => retry()}
            className="focus-ring h-12 rounded-full bg-brand px-6 text-on-brand hover:bg-brand-hover"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
