import { useCallback, useState } from "react";
import { AchievementsPanel, ACHIEVEMENT_NAV_SECTIONS } from "./AchievementsPanel";

export function AchievementsPage() {
  const [activeSection, setActiveSection] = useState<string>("all");

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    if (sectionId === "all") {
      document.querySelector(".achievements-page-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="achievements-page">
      <header className="achievements-page-header">
        <div>
          <h2>Achievements</h2>
          <p className="muted">Track milestones, culture goals, and alternate company endings.</p>
        </div>
      </header>

      <div className="achievements-page-body">
        <nav className="achievements-page-nav" aria-label="Achievement categories">
          {ACHIEVEMENT_NAV_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`achievements-nav-btn${activeSection === section.id ? " active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="achievements-page-scroll">
          <AchievementsPanel onSectionFocus={setActiveSection} />
        </div>
      </div>
    </div>
  );
}