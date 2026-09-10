import { Bell, ChevronDown, CircleUserRound, MapPin } from "lucide-react";
import { DepartmentNav } from "@/components/department/department-nav";
import { requireOperator } from "@/lib/auth";
import { SignOutButton } from "@/components/department/sign-out-button";

export default async function DepartmentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireOperator();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <DepartmentNav variant="desktop" />
      <div className="workspace">
        <header className="utility-bar">
          <div className="utility-bar__destination">
            <MapPin aria-hidden="true" size={17} />
            <span><small>Active destination</small><strong>Highland Operations Zone</strong></span>
            <ChevronDown aria-hidden="true" size={16} />
          </div>
          <div className="utility-bar__actions">
            <span className="prototype-label">Prototype data — not live</span>
            <button type="button" className="icon-button" aria-label="Notifications unavailable in UI Phase 1" disabled>
              <Bell aria-hidden="true" size={19} />
            </button>
            <span className="operator-badge">
              <CircleUserRound aria-hidden="true" size={20} />
              <span>{profile.full_name || profile.role}</span>
            </span>
            <SignOutButton />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
      </div>
      <DepartmentNav variant="mobile" />
    </div>
  );
}
