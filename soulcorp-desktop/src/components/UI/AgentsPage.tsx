import { useCallback, useState } from "react";
import { AppPageShell } from "./AppPageShell";
import { AgentsPanel, AGENTS_SECTIONS } from "./AgentsPanel";

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
      navItems={AGENTS_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
    >
      <AgentsPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}