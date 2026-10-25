import { Suspense } from "react";

import { GroupView } from "./group-view";

async function GroupRoute({ params }: { params: PageProps<"/groups/[id]">["params"] }) {
  const { id } = await params;
  return <GroupView id={id} />;
}

export default function GroupPage(props: PageProps<"/groups/[id]">) {
  return (
    <Suspense>
      <GroupRoute params={props.params} />
    </Suspense>
  );
}
