import type { ReactNode } from "react";

export interface AppPageNavItem {
  id: string;
  label: string;
  hint?: string;
  step?: string | number;
}

export interface AppPageShellProps {
  title: string;
  subtitle?: string;
  badge?: string;
  headerAction?: ReactNode;
  navTitle?: string;
  navItems: AppPageNavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;
  children: ReactNode;
  kpiRow?: ReactNode;
  navVariant?: "default" | "pipeline";
}

export function AppPageShell({
  title,
  subtitle,
  badge,
  headerAction,
  navTitle,
  navItems,
  activeNavId,
  onNavSelect,
  children,
  kpiRow,
  navVariant = "default",
}: AppPageShellProps) {
  const pipeline = navVariant === "pipeline";

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="app-page-header-main">
          {badge ? <p className="workflow-step-badge">{badge}</p> : null}
          <h2>{title}</h2>
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
        {headerAction ? <div className="app-page-header-actions">{headerAction}</div> : null}
      </header>

      {kpiRow ? <div className="app-page-kpi">{kpiRow}</div> : null}

      <div className="app-page-body">
        <nav
          className={`app-page-nav${pipeline ? " app-page-nav--pipeline" : ""}`}
          aria-label={`${title} sections`}
        >
          {navTitle ? <p className="app-page-nav-title">{navTitle}</p> : null}
          {navItems.map((item, index) => (
            <div key={item.id} className="app-page-nav-item">
              {pipeline && index > 0 ? (
                <span className="app-page-nav-connector" aria-hidden="true" />
              ) : null}
              <button
                type="button"
                className={`app-page-nav-btn${activeNavId === item.id ? " active" : ""}${pipeline ? " app-page-nav-btn--pipeline" : ""}`}
                onClick={() => onNavSelect(item.id)}
                title={item.hint}
              >
                {item.step != null ? (
                  <span className="app-page-nav-step">{item.step}</span>
                ) : null}
                <span className="app-page-nav-text">
                  <span className="app-page-nav-label">{item.label}</span>
                  {item.hint ? <span className="app-page-nav-hint">{item.hint}</span> : null}
                </span>
              </button>
            </div>
          ))}
        </nav>

        <div className="app-page-content">{children}</div>
      </div>
    </div>
  );
}