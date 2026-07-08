import { useCallback, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { MeetingPanel, MEETING_SECTIONS } from "./MeetingPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function MeetingPage() {
  const [activeSection, setActiveSection] = useState<string>(MEETING_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Meeting"
      subtitle="Align team before execution"
      badge={formatWorkflowStepBadge("meeting")}
      navItems={MEETING_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={<WorkflowNextButton panel="meeting" />}
    >
      <MeetingPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}