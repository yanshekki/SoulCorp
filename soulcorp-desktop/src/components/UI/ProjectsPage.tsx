import { useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { ProjectsPanel, PROJECTS_SECTIONS } from "./ProjectsPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function ProjectsPage() {
  const [activeSection, setActiveSection] = useState<string>(PROJECTS_SECTIONS[0].id);

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
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="projects" />}
    >
      <ProjectsPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
