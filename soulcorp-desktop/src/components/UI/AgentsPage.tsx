import { useCallback, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { AgentsPanel, AGENTS_SECTIONS } from "./AgentsPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function AgentsPage() {
  const [activeSection, setActiveSection] = useState<string>(AGENTS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Agent Brains"
      subtitle="LLM brains, execution runtime & soul.md"
      badge={formatWorkflowStepBadge("agents")}
      navItems={AGENTS_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={<WorkflowNextButton panel="agents" />}
    >
      <AgentsPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}