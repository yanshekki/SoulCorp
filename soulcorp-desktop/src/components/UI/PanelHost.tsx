import { Suspense, useEffect, useRef, useState, type ComponentType } from "react";
import type { SidebarPanel } from "../../types/game";
import { resolveLazyPanel } from "../../config/lazyPanels";
import { PanelSuspense } from "./PanelSuspense";
import { useI18n } from "../../i18n/I18nProvider";

const MAX_CACHED_PANELS = 6;

interface PanelHostProps {
  activePanel: SidebarPanel;
  stageReady: boolean;
}

function LazyPanel({ panel }: { panel: SidebarPanel }) {
  const { t } = useI18n();
  const Component = resolveLazyPanel(panel) as ComponentType<object> | null;
  if (!Component) {
    const section = t("nav.workspace");
    return (
      <div className="app-stage-placeholder">
        <p className="muted">
          {t("panelHost.placeholder", { section })}
        </p>
      </div>
    );
  }
  return <Component />;
}

export function PanelHost({ activePanel, stageReady }: PanelHostProps) {
  const [visited, setVisited] = useState<SidebarPanel[]>([activePanel]);
  const orderRef = useRef<SidebarPanel[]>([activePanel]);

  useEffect(() => {
    setVisited((prev) => {
      orderRef.current = [...orderRef.current.filter((p) => p !== activePanel), activePanel];
      if (prev.includes(activePanel)) {
        return prev;
      }
      let next = [...prev, activePanel];
      while (next.length > MAX_CACHED_PANELS) {
        const evict = orderRef.current[0];
        if (!evict) {
          break;
        }
        orderRef.current = orderRef.current.slice(1);
        next = next.filter((p) => p !== evict);
      }
      return next;
    });
  }, [activePanel]);

  if (!stageReady) {
    return <div className="app-stage-transition" aria-hidden="true" />;
  }

  return (
    <>
      {visited.map((panel) => {
        const isActive = panel === activePanel;
        return (
          <div
            key={panel}
            className="panel-host-slot"
            hidden={!isActive}
            aria-hidden={!isActive}
          >
            <Suspense fallback={<PanelSuspense />}>
              <LazyPanel panel={panel} />
            </Suspense>
          </div>
        );
      })}
    </>
  );
}