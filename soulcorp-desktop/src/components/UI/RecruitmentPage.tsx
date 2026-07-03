import { useCallback, useState } from "react";
import { RecruitmentPanel, RECRUITMENT_SECTIONS } from "./RecruitmentPanel";

export function RecruitmentPage() {
  const [activeSection, setActiveSection] = useState<string>(RECRUITMENT_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="recruitment-page">
      <header className="recruitment-page-header">
        <div>
          <h2>Recruitment</h2>
          <p className="muted">
            Browse SOUL.md personas from soulmd-hub, score team fit, run panel interviews, and map
            agent relationships.
          </p>
        </div>
      </header>

      <div className="recruitment-page-body">
        <nav className="recruitment-page-nav" aria-label="Recruitment sections">
          {RECRUITMENT_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`recruitment-nav-btn${activeSection === section.id ? " active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="recruitment-page-scroll">
          <RecruitmentPanel onSectionFocus={setActiveSection} />
        </div>
      </div>
    </div>
  );
}