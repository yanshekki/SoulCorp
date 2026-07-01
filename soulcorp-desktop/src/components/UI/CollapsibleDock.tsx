import type { ReactNode } from "react";

interface CollapsibleDockProps {
  className?: string;
  hint?: string | null;
  children: ReactNode;
}

export function CollapsibleDock({ className, hint, children }: CollapsibleDockProps) {
  return (
    <div className={`collapsible-dock${className ? ` ${className}` : ""}`}>
      {hint ? (
        <p className="collapsible-dock-hint" aria-live="polite">
          {hint}
        </p>
      ) : null}
      <div className="collapsible-dock-bar">{children}</div>
    </div>
  );
}