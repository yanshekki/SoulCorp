import { useCallback, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { getNextWorkflowPanel } from "../../config/navigation";
import { ProjectsPanel, PROJECTS_SECTIONS } from "./ProjectsPanel";

export function ProjectsPage() {
  const setActivePanel = useGameStore((s) => s.setActivePanel);
  const [activeSection, setActiveSection] = useState<string>(PROJECTS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const nextPanel = getNextWorkflowPanel("projects");

  return (
    <div className="projects-page">
      <header className="projects-page-header">
        <div>
          <p className="workflow-step-badge">CEO Workflow · Step 1</p>
          <h2>Projects</h2>
          <p className="muted">
            Directive → backlog → sprint → assign → execute. Deliverables land in Workspace.
          </p>
        </div>
        {nextPanel ? (
          <button
            type="button"
            className="workflow-next-btn workflow-next-btn--header"
            onClick={() => setActivePanel(nextPanel)}
          >
            Next: Meeting →
          </button>
        ) : null}
      </header>

      <div className="projects-page-body">
        <nav className="projects-page-nav" aria-label="Projects workflow">
          <p className="projects-nav-title">Pipeline</p>
          {PROJECTS_SECTIONS.map((section, index) => (
            <div key={section.id} className="projects-nav-item">
              {index > 0 ? <span className="projects-nav-connector" aria-hidden="true" /> : null}
              <button
                type="button"
                className={`projects-nav-btn${activeSection === section.id ? " active" : ""}`}
                onClick={() => scrollToSection(section.id)}
                title={section.hint}
              >
                <span className="projects-nav-step">{section.step}</span>
                <span className="projects-nav-text">
                  <span className="projects-nav-label">{section.label}</span>
                  <span className="projects-nav-hint">{section.hint}</span>
                </span>
              </button>
            </div>
          ))}
        </nav>

        <div className="projects-page-scroll">
          <ProjectsPanel onSectionFocus={setActiveSection} />
        </div>
      </div>
    </div>
  );
}