import { Suspense } from "react";

import { JoinView } from "./join-view";

async function JoinRoute({ params }: { params: PageProps<"/groups/[id]/join">["params"] }) {
  const { id } = await params;
  return <JoinView id={id} />;
}

export default function JoinPage(props: PageProps<"/groups/[id]/join">) {
  return (
    <Suspense>
      <JoinRoute params={props.params} />
    </Suspense>
  );
}
