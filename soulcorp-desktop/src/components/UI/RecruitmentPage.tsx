import { useCallback, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { RecruitmentPanel, RECRUITMENT_SECTIONS } from "./RecruitmentPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function RecruitmentPage() {
  const [activeSection, setActiveSection] = useState<string>(RECRUITMENT_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Recruitment"
      subtitle="Hire & onboard agents"
      badge={formatWorkflowStepBadge("recruitment")}
      navItems={RECRUITMENT_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={<WorkflowNextButton panel="recruitment" />}
    >
      <RecruitmentPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}