import { Suspense } from "react";

import { MembersOnly } from "@/components/shell/members-only";

import { CreditView } from "./credit-view";

async function CreditRoute({ params }: { params: PageProps<"/groups/[id]/credit">["params"] }) {
  const { id } = await params;
  return (
    <MembersOnly>
      <CreditView id={id} />
    </MembersOnly>
  );
}

export default function CreditPage(props: PageProps<"/groups/[id]/credit">) {
  return (
    <Suspense>
      <CreditRoute params={props.params} />
    </Suspense>
  );
}
