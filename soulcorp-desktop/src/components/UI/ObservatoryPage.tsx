import { useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { ObservatoryPanel, OBSERVATORY_SECTIONS } from "./observatory/ObservatoryPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function ObservatoryPage() {
  const [activeSection, setActiveSection] = useState<string>(OBSERVATORY_SECTIONS[0].id);

  return (
    <AppPageShell
      title="Observatory"
      subtitle="Live agent minds"
      badge={formatWorkflowStepBadge("observatory")}
      navItems={OBSERVATORY_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        hint: section.hint,
      }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="observatory" />}
    >
      <ObservatoryPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
