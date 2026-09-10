export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand__mark">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            </svg>
          </span>
          <div>
            <strong>PRAVAAH</strong>
            <small>Department console</small>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
