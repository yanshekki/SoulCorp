import { useMemo, useState } from "react";
import { getVisibleSettingsSections } from "../../config/settingsSections";
import { useI18n } from "../../i18n/I18nProvider";
import { AppPageShell } from "./AppPageShell";
import { SettingsPanel } from "./SettingsPanel";

const VISIBLE_SETTINGS_SECTIONS = getVisibleSettingsSections();

const SECTION_I18N: Record<string, string> = {
  general: "settings.section.general",
  play: "settings.section.play",
  display: "settings.section.display",
  audio: "settings.section.audio",
  cloud: "settings.section.cloud",
  ai: "settings.section.ai",
  meetings: "settings.section.meetings",
  backup: "settings.section.backup",
  deploy: "settings.section.deploy",
};

export function SettingsPage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>(VISIBLE_SETTINGS_SECTIONS[0].id);

  const navItems = useMemo(
    () =>
      VISIBLE_SETTINGS_SECTIONS.map((section) => ({
        id: section.id,
        label: t(SECTION_I18N[section.id] ?? section.label),
      })),
    [t],
  );

  return (
    <AppPageShell
      title={t("settings.pageTitle")}
      subtitle={t("settings.pageSubtitle")}
      navItems={navItems}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
    >
      <SettingsPanel activeSection={activeSection} />
    </AppPageShell>
  );
}
