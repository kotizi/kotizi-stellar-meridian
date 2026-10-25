import { Suspense } from "react";

import { CreditView } from "./credit-view";

async function CreditRoute({ params }: { params: PageProps<"/groups/[id]/credit">["params"] }) {
  const { id } = await params;
  return <CreditView id={id} />;
}

export default function CreditPage(props: PageProps<"/groups/[id]/credit">) {
  return (
    <Suspense>
      <CreditRoute params={props.params} />
    </Suspense>
  );
}
