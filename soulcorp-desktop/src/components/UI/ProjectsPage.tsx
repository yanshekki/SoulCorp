import { useCallback, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { ProjectsPanel, PROJECTS_SECTIONS } from "./ProjectsPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function ProjectsPage() {
  const [activeSection, setActiveSection] = useState<string>(PROJECTS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Projects"
      subtitle="Directive → sprint → execute"
      badge={formatWorkflowStepBadge("projects")}
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
      headerAction={<WorkflowNextButton panel="projects" />}
    >
      <ProjectsPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}