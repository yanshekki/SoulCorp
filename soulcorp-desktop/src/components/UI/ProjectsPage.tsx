import { useCallback, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { getNextWorkflowPanel } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { ProjectsPanel, PROJECTS_SECTIONS } from "./ProjectsPanel";

export function ProjectsPage() {
  const setActivePanel = useGameStore((s) => s.setActivePanel);
  const [activeSection, setActiveSection] = useState<string>(PROJECTS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const nextPanel = getNextWorkflowPanel("projects");

  return (
    <AppPageShell
      title="Projects"
      subtitle="Directive → sprint → execute"
      badge="Step 1"
      navTitle="Pipeline"
      navVariant="pipeline"
      navItems={PROJECTS_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        hint: section.hint,
        step: section.step,
      }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={
        nextPanel ? (
          <button type="button" className="btn btn--workflow" onClick={() => setActivePanel(nextPanel)}>
            Next: Meeting →
          </button>
        ) : null
      }
    >
      <ProjectsPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}