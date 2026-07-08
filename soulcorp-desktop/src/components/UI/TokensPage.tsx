import { useCallback, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { FinancePanel, TOKENS_SECTIONS } from "./FinancePanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function TokensPage() {
  const [activeSection, setActiveSection] = useState<string>(TOKENS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Tokens"
      subtitle="Pool, wallets, usage"
      badge={formatWorkflowStepBadge("finance")}
      navItems={TOKENS_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={<WorkflowNextButton panel="finance" />}
    >
      <FinancePanel onSectionFocus={setActiveSection} onNavigateSection={scrollToSection} />
    </AppPageShell>
  );
}