'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gauge,
  LayoutDashboard,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
  TicketCheck,
  type LucideIcon,
} from "lucide-react";

const navigation: Array<{
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}> = [
  { href: "/overview", label: "Overview", shortLabel: "Overview", icon: LayoutDashboard },
  { href: "/capacity", label: "Capacity", shortLabel: "Capacity", icon: Gauge },
  { href: "/permits", label: "Permits", shortLabel: "Permits", icon: TicketCheck },
  { href: "/qr-checkpoint", label: "QR checkpoint", shortLabel: "Scan", icon: QrCode },
  { href: "/control-room", label: "Control room", shortLabel: "Control", icon: SlidersHorizontal },
];

export function DepartmentNav({ variant }: { variant: "desktop" | "mobile" }) {
  const pathname = usePathname();

  if (variant === "mobile") {
    return (
      <nav aria-label="Department navigation" className="mobile-nav">
        <div className="mobile-nav__inner">
          {navigation.map(({ href, shortLabel, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className="mobile-nav__link"
                data-active={isActive}
              >
                <Icon aria-hidden="true" size={20} strokeWidth={isActive ? 2.25 : 1.8} />
                <span>{shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <aside className="sidebar" aria-label="Department workspace">
      <div className="brand">
        <span className="brand__mark"><ShieldCheck aria-hidden="true" size={22} /></span>
        <span><strong>PRAVAAH</strong><small>Department console</small></span>
      </div>
      <nav aria-label="Department navigation" className="sidebar__nav">
        <p className="nav-label">Workspace</p>
        {navigation.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className="sidebar__link"
              data-active={isActive}
            >
              <Icon aria-hidden="true" size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        <span className="status-dot" aria-hidden="true" />
        <span><strong>UI Phase 1</strong><small>Read-only prototype</small></span>
      </div>
    </aside>
  );
}
