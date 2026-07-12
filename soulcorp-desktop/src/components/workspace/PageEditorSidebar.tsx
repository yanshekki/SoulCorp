import { useState } from "react";
import type { WorkspacePage } from "../../types/workspace";
import { PageComments } from "./PageComments";
import { PageLinks } from "./PageLinks";
import { PageVersionHistory } from "./PageVersionHistory";
import { useI18n } from "../../i18n/I18nProvider";

type SidebarTab = "links" | "comments" | "history";

interface PageEditorSidebarProps {
  page: WorkspacePage;
  onPageUpdated: (page: WorkspacePage) => void;
  onOpenPage: (pageId: string) => void;
  onRestored: (page: WorkspacePage) => void;
}

const TABS: { id: SidebarTab; labelKey: string; icon: string }[] = [
  { id: "links", labelKey: "workspace.sidebar.links", icon: "⛓" },
  { id: "comments", labelKey: "workspace.sidebar.comments", icon: "💬" },
  { id: "history", labelKey: "workspace.sidebar.history", icon: "🕐" },
];

export function PageEditorSidebar({
  page,
  onPageUpdated,
  onOpenPage,
  onRestored,
}: PageEditorSidebarProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<SidebarTab>("links");

  return (
    <aside className="ws-page-sidebar">
      <nav className="ws-page-sidebar-tabs" aria-label={t("workspace.pagePanels")}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ws-page-sidebar-tab${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {t(item.labelKey)}
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