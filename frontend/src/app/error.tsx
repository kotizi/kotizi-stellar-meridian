"use client";

import { useEffect } from "react";

import { invalidateChain } from "@/chain/hooks";
import { ScreenTitle } from "@/components/kz/screen";
import { Button } from "@/components/ui/button";

/** A screen outside the app shell (landing, /verify) that crashed while rendering. */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const tryAgain = () => {
    // Chain reads live in the client cache, which retry() doesn't know about.
    invalidateChain();
    retry();
  };

  return (
    <main role="alert" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      <ScreenTitle eyebrow="Error" title="Something went wrong." caption="This page couldn't be loaded. Please try again." />
      <Button variant="primary" size="lg" onClick={tryAgain}>
        Try again
      </Button>
    </main>
  );
}
