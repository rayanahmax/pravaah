import { CircleUserRound } from "lucide-react";
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
          <div className="utility-bar__title">
            <span>Department console</span>
          </div>
          <div className="utility-bar__actions">
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
