"use client";

import { useEffect } from "react";

import { invalidateChain } from "@/chain/hooks";
import { ScreenTitle } from "@/components/kz/screen";
import { Button } from "@/components/ui/button";

/** A screen that crashed while rendering. The shell stays, so the sidebar still navigates away. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const tryAgain = () => {
    // Chain reads live in the client cache, which retry() doesn't know about.
    invalidateChain();
    retry();
  };

  return (
    <div role="alert" className="flex flex-1 flex-col items-start gap-6 pt-6">
      <ScreenTitle
        eyebrow="Error"
        title="Something went wrong."
        caption="This page couldn't be loaded. Please try again or pick another screen from the side menu."
      />
      <Button variant="primary" size="lg" onClick={tryAgain}>
        Try again
      </Button>
    </div>
  );
}
