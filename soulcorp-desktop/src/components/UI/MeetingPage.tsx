import { useCallback, useState } from "react";
import { getNextWorkflowPanel } from "../../config/navigation";
import { useGameStore } from "../../stores/gameStore";
import { AppPageShell } from "./AppPageShell";
import { MeetingPanel, MEETING_SECTIONS } from "./MeetingPanel";

export function MeetingPage() {
  const setActivePanel = useGameStore((s) => s.setActivePanel);
  const [activeSection, setActiveSection] = useState<string>(MEETING_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const nextPanel = getNextWorkflowPanel("meeting");

  return (
    <AppPageShell
      title="Meeting"
      subtitle="Align team before execution"
      badge="Step 2"
      navItems={MEETING_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
      headerAction={
        nextPanel ? (
          <button type="button" className="btn btn--workflow" onClick={() => setActivePanel(nextPanel)}>
            Next: Workspace →
          </button>
        ) : null
      }
    >
      <MeetingPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}