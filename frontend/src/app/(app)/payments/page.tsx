import { MembersOnly } from "@/components/shell/members-only";

import { PaymentsView } from "./payments-view";

export default function PaymentsPage() {
  return (
    <MembersOnly>
      <PaymentsView />
    </MembersOnly>
  );
}
