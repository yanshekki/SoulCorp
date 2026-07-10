import { useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { RecruitmentPanel, RECRUITMENT_SECTIONS } from "./RecruitmentPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function RecruitmentPage() {
  const [activeSection, setActiveSection] = useState<string>(RECRUITMENT_SECTIONS[0].id);

  return (
    <AppPageShell
      title="Recruitment"
      subtitle="Hire agents into your company"
      badge={formatWorkflowStepBadge("recruitment")}
      navItems={RECRUITMENT_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="recruitment" />}
    >
      <RecruitmentPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
