import { useCallback, useState } from "react";
import { getVisibleSettingsSections } from "../../config/settingsSections";
import { AppPageShell } from "./AppPageShell";
import { SettingsPanel } from "./SettingsPanel";

const VISIBLE_SETTINGS_SECTIONS = getVisibleSettingsSections();

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<string>(VISIBLE_SETTINGS_SECTIONS[0].id);

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <AppPageShell
      title="Settings"
      subtitle="Sync, AI providers, backups, deploy"
      navItems={VISIBLE_SETTINGS_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={scrollToSection}
    >
      <SettingsPanel onSectionFocus={setActiveSection} />
    </AppPageShell>
  );
}