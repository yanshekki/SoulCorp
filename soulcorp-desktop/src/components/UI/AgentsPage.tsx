import { useCallback, useState } from "react";
import { AgentsPanel, AGENTS_SECTIONS } from "./AgentsPanel";

export function AgentsPage() {
  const [activeSection, setActiveSection] = useState<string>(AGENTS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="agents-page">
      <header className="agents-page-header">
        <div>
          <h2>Agent Brains</h2>
          <p className="muted">
            Department defaults and per-employee LLM overrides. Priority: agent → department →
            company default. Token limits are in Tokens.
          </p>
        </div>
      </header>

      <div className="agents-page-body">
        <nav className="agents-page-nav" aria-label="Agent brain sections">
          {AGENTS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`agents-nav-btn${activeSection === section.id ? " active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="agents-page-scroll">
          <AgentsPanel onSectionFocus={setActiveSection} />
        </div>
      </div>
    </div>
  );
}