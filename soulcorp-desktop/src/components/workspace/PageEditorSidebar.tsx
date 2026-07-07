import { useState } from "react";
import type { WorkspacePage } from "../../types/workspace";
import { PageComments } from "./PageComments";
import { PageLinks } from "./PageLinks";
import { PageVersionHistory } from "./PageVersionHistory";

type SidebarTab = "links" | "comments" | "history";

interface PageEditorSidebarProps {
  page: WorkspacePage;
  onPageUpdated: (page: WorkspacePage) => void;
  onOpenPage: (pageId: string) => void;
  onRestored: (page: WorkspacePage) => void;
}

const TABS: { id: SidebarTab; label: string; icon: string }[] = [
  { id: "links", label: "Links", icon: "⛓" },
  { id: "comments", label: "Comments", icon: "💬" },
  { id: "history", label: "History", icon: "🕐" },
];

export function PageEditorSidebar({
  page,
  onPageUpdated,
  onOpenPage,
  onRestored,
}: PageEditorSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>("links");

  return (
    <aside className="ws-page-sidebar">
      <nav className="ws-page-sidebar-tabs" aria-label="Page panels">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ws-page-sidebar-tab${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="ws-page-sidebar-panel">
        {tab === "links" ? (
          <PageLinks page={page} onPageUpdated={onPageUpdated} onOpenPage={onOpenPage} />
        ) : null}
        {tab === "comments" ? <PageComments pageId={page.id} /> : null}
        {tab === "history" ? (
          <PageVersionHistory pageId={page.id} onRestored={onRestored} />
        ) : null}
      </div>
    </aside>
  );
}