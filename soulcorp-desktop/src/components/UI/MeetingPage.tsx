import { useMemo, useState } from "react";
import { formatWorkflowStepBadge } from "../../config/navigation";
import { useI18n } from "../../i18n/I18nProvider";
import { mapSections } from "../../i18n/sectionLabels";
import { AppPageShell } from "./AppPageShell";
import { MeetingPanel, MEETING_SECTIONS } from "./MeetingPanel";
import { WorkflowNextButton } from "./WorkflowNextButton";

export function MeetingPage() {
  const { t } = useI18n();
  // Land on Session (start/advance) — Overview is status-only.
  const [activeSection, setActiveSection] = useState<string>("session");
  const navItems = useMemo(() => mapSections(t, "meeting", MEETING_SECTIONS), [t]);

  return (
    <AppPageShell
      title={t("page.meeting.title")}
      subtitle={t("page.meeting.subtitle")}
      badge={formatWorkflowStepBadge("meeting")}
      navItems={navItems.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
      headerAction={<WorkflowNextButton panel="meeting" />}
    >
      <MeetingPanel activeSection={activeSection} onNavigateSection={setActiveSection} />
    </AppPageShell>
  );
}
