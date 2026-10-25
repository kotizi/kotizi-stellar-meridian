import { AuthGate } from "@/components/shell/auth-gate";
import { Breakpoint } from "@/components/shell/breakpoint";
import { IdentityGate } from "@/components/shell/identity-gate";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";

// App shell: mobile-first (390px) with a bottom tab bar; sidebar from 1024px up. Signed-in accounts only.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <div className="flex min-h-full flex-1 flex-col overflow-x-clip lg:pl-[248px]">
        <Breakpoint show="desktop">
          <Sidebar />
        </Breakpoint>
        <Breakpoint show="mobile">
          <MobileTopBar />
        </Breakpoint>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-2 pb-[108px] lg:max-w-5xl lg:px-10 lg:pt-10 lg:pb-12">
          <IdentityGate>{children}</IdentityGate>
        </main>
        <TabBar />
      </div>
    </AuthGate>
  );
}
