import { MembersOnly } from "@/components/shell/members-only";

import { DrawsView } from "./draws-view";

export default function DrawsPage() {
  return (
    <MembersOnly>
      <DrawsView />
    </MembersOnly>
  );
}
