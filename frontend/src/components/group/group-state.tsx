import { TextLink } from "@/components/kz/text-link";
import { Skeleton } from "@/components/ui/skeleton";

/** The group screen's shape: title, then the plan and rules beside the details and the action. */
export function GroupLoading() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <Skeleton className="h-16 w-2/3 rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-60 rounded-lg" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function GroupNotFound() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="type-h3">Group not found</h1>
      <TextLink href="/groups" className="self-start">
        Back to groups
      </TextLink>
    </div>
  );
}
