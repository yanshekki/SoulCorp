import { getNextWorkflowPanel, getWorkflowPanelLabel } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";

interface WorkflowNextButtonProps {
  panel: SidebarPanel;
  className?: string;
}

export function WorkflowNextButton({ panel, className = "btn btn--workflow" }: WorkflowNextButtonProps) {
  const { t } = useI18n();
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const nextPanel = getNextWorkflowPanel(panel);
  if (!nextPanel) {
    return null;
  }

  const navKey = `nav.${nextPanel}`;
  const translated = t(navKey);
  const label = translated === navKey ? getWorkflowPanelLabel(nextPanel) : translated;

  return (
    <button type="button" className={className} onClick={() => setActivePanel(nextPanel)}>
      {t("workflow.next", { label })}
    </button>
  );
}
