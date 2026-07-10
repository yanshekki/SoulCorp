import { useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { AppPageShell } from "./AppPageShell";
import { MeetingPanel, MEETING_SECTIONS } from "./MeetingPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function MeetingPage() {
  // Land on Session (start/advance) — Overview is status-only.
  const [activeSection, setActiveSection] = useState<string>("session");

  return (
    <AppPageShell
      title="Meeting"
      subtitle="Align team before execution"
      badge={formatWorkflowStepBadge("meeting")}
      navItems={MEETING_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="meeting" />}
    >
      <MeetingPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
