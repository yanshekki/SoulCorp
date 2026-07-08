import { getNextWorkflowPanel, getWorkflowPanelLabel } from "../../config/navigation";
import { useGameStore } from "../../stores/gameStore";
import type { SidebarPanel } from "../../types/game";

interface WorkflowNextButtonProps {
  panel: SidebarPanel;
  className?: string;
}

export function WorkflowNextButton({ panel, className = "btn btn--workflow" }: WorkflowNextButtonProps) {
  const setActivePanel = useGameStore((state) => state.setActivePanel);
  const nextPanel = getNextWorkflowPanel(panel);
  if (!nextPanel) {
    return null;
  }

  return (
    <button type="button" className={className} onClick={() => setActivePanel(nextPanel)}>
      Next: {getWorkflowPanelLabel(nextPanel)} →
    </button>
  );
}