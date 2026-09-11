import { Home, MapPin, TicketCheck, type LucideIcon } from "lucide-react";

/**
 * The visitor's primary destinations, in the order they appear.
 *
 * One list, two renderings: the server-rendered header row in `layout.tsx` and the
 * client-rendered mobile tab bar in `tourist-mobile-nav.tsx` (which needs
 * `usePathname` for the active state). Keeping the list in its own module — with no
 * `"use client"` directive, so both sides may import it — is what guarantees a
 * phone never offers a route a laptop does not, or the reverse.
 */
export const touristNavigation: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { href: "/visitor", label: "Home", icon: Home },
  { href: "/destinations", label: "Destinations", icon: MapPin },
  { href: "/my-permits", label: "My permits", icon: TicketCheck },
];

/**
 * Match a nav item to the URL, treating nested routes as belonging to their
 * section: /my-permits/new and /my-permits/[id]/qr are still "My permits", and
 * /destinations/[id] is still "Destinations". An exact compare would drop the
 * highlight on exactly the pages a visitor spends the most time in.
 */
export function isTouristSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
