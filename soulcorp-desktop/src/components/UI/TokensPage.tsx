import { useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { FinancePanel, TOKENS_SECTIONS } from "./FinancePanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function TokensPage() {
  const [activeSection, setActiveSection] = useState<string>(TOKENS_SECTIONS[0].id);

  return (
    <AppPageShell
      title="Tokens"
      subtitle="Budget, payroll, usage"
      badge={formatWorkflowStepBadge("finance")}
      navItems={TOKENS_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="finance" />}
    >
      <FinancePanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
