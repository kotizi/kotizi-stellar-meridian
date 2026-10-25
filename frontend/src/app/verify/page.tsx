import { Suspense } from "react";

import { VerifyView } from "./verify-view";

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyView />
    </Suspense>
  );
}
