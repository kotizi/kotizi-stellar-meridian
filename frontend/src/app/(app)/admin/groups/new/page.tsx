import { CreateGroupView } from "@/features/admin";

// The form waits until the account is known to be the admin (`useIsAdmin`), so a navigation here
// isn't instant. Declared on the page too: the admin layout's `false` doesn't cover the page segment.
export const instant = false;

export default function CreateGroupPage() {
  return <CreateGroupView />;
}
