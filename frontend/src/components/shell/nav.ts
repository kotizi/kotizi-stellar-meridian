export const NAV = [
  { href: "/home", label: "Home" },
  { href: "/groups", label: "Groups" },
  { href: "/payments", label: "Payments" },
  { href: "/draws", label: "Draws" },
] as const;

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
