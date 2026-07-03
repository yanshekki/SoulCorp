import { useCallback, useState } from "react";
import { getNextWorkflowPanel } from "../../config/navigation";
import { useGameStore } from "../../stores/gameStore";
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
    <div className="meeting-page">
      <header className="meeting-page-header">
        <div>
          <p className="workflow-step-badge">CEO Workflow · Step 2</p>
          <h2>Meeting</h2>
          <p className="muted">
            Align the team on directives before execution. Notes auto-save to Workspace.
          </p>
        </div>
        {nextPanel ? (
          <button
            type="button"
            className="workflow-next-btn workflow-next-btn--header"
            onClick={() => setActivePanel(nextPanel)}
          >
            Next: Workspace →
          </button>
        ) : null}
      </header>

      <div className="meeting-page-body">
        <nav className="meeting-page-nav" aria-label="Meeting sections">
          {MEETING_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`meeting-nav-btn${activeSection === section.id ? " active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="meeting-page-scroll">
          <MeetingPanel onSectionFocus={setActiveSection} />
        </div>
      </div>
    </div>
  );
}