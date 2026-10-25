import { AdminGate } from "@/features/admin";

// Admin screens may block: they show a placeholder until the account is known to be the admin, so a
// non-admin never sees the form (Next's instant-navigation check would otherwise flag the segment).
export const instant = false;

// Admin screens (group creation): the program's admin only; anyone else goes to the app's home.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminGate>{children}</AdminGate>;
}
