import { useState } from "react";
import { getVisibleSettingsSections } from "../../config/settingsSections";
import { AppPageShell } from "./AppPageShell";
import { SettingsPanel } from "./SettingsPanel";

const VISIBLE_SETTINGS_SECTIONS = getVisibleSettingsSections();

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<string>(VISIBLE_SETTINGS_SECTIONS[0].id);

  return (
    <AppPageShell
      title="Settings"
      subtitle="Sync, AI providers, backups, deploy"
      navItems={VISIBLE_SETTINGS_SECTIONS.map((section) => ({ id: section.id, label: section.label }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
    >
      <SettingsPanel activeSection={activeSection} />
    </AppPageShell>
  );
}
