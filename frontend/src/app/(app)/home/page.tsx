import { MembersOnly } from "@/components/shell/members-only";

import { HomeView } from "./home-view";

export default function HomePage() {
  return (
    <MembersOnly>
      <HomeView />
    </MembersOnly>
  );
}
