import { CreateGroupLink } from "@/features/admin";
import { OpenGroups } from "@/components/group/open-groups";
import { ReferenceNote, ScreenTitle } from "@/components/kz/screen";

// Screen 03 · Open groups.
export function GroupsView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ScreenTitle
          eyebrow="Open groups"
          title="Choose your group"
          caption="One draw per installment. Every share is contemplated before the term ends."
        />
        <CreateGroupLink />
      </div>
      <OpenGroups />
      <ReferenceNote />
    </div>
  );
}
