import { useMemo, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { mapSections } from "../../i18n/sectionLabels";
import { AppPageShell } from "./AppPageShell";
import { ProjectsPanel, PROJECTS_SECTIONS } from "./ProjectsPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function ProjectsPage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>(PROJECTS_SECTIONS[0].id);
  const navItems = useMemo(
    () =>
      mapSections(t, "projects", PROJECTS_SECTIONS).map((section, index) => ({
        ...section,
        step: PROJECTS_SECTIONS[index]?.step,
      })),
    [t],
  );

  return (
    <AppPageShell
      title={t("page.projects.title")}
      subtitle={t("page.projects.subtitle")}
      badge={formatWorkflowStepBadge("projects")}
      navTitle={t("projects.navTitle")}
      navVariant="pipeline"
      navItems={navItems}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="projects" />}
    >
      <ProjectsPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
