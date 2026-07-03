import { useCallback, useState } from "react";
import { getVisibleSettingsSections } from "../../config/settingsSections";
import { SettingsPanel } from "./SettingsPanel";

const VISIBLE_SETTINGS_SECTIONS = getVisibleSettingsSections();

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<string>(VISIBLE_SETTINGS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div>
          <h2>Settings</h2>
          <p className="muted">
            Cloud sync, AI providers, meeting defaults, backups, and one-click deploy.
          </p>
        </div>
      </header>

      <div className="settings-page-body">
        <nav className="settings-page-nav" aria-label="Settings sections">
          {VISIBLE_SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`settings-nav-btn${activeSection === section.id ? " active" : ""}`}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <div className="settings-page-scroll">
          <SettingsPanel onSectionFocus={setActiveSection} />
        </div>
      </div>
    </div>
  );
}