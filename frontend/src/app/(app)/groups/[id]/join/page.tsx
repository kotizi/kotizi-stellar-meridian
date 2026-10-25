import { Suspense } from "react";

import { MembersOnly } from "@/components/shell/members-only";

import { JoinView } from "./join-view";

async function JoinRoute({ params }: { params: PageProps<"/groups/[id]/join">["params"] }) {
  const { id } = await params;
  return (
    <MembersOnly>
      <JoinView id={id} />
    </MembersOnly>
  );
}

export default function JoinPage(props: PageProps<"/groups/[id]/join">) {
  return (
    <Suspense>
      <JoinRoute params={props.params} />
    </Suspense>
  );
}
