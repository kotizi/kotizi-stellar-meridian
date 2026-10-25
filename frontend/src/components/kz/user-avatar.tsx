import { UserIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/** Up to two initials from a name or email ("sofia.prado@x" → "SP"). */
export function initials(label: string): string {
  const parts = label.split("@")[0].split(/[\s._-]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/**
 * Design system avatar (Átomos · Indicadores · Avatar): initials in lavender with graphite text,
 * a generic icon when there is no data.
 */
export function UserAvatar({ label, ...props }: { label: string | null } & ComponentProps<typeof Avatar>) {
  const text = label ? initials(label) : "";
  return (
    <Avatar {...props}>
      {text ? (
        <AvatarFallback>{text}</AvatarFallback>
      ) : (
        <AvatarFallback className="bg-surface text-tertiary ring-1 ring-default ring-inset">
          <UserIcon className="size-[55%]" aria-hidden />
        </AvatarFallback>
      )}
    </Avatar>
  );
}
