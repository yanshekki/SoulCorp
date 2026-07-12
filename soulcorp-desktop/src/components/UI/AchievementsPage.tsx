import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { AppPageShell } from "./AppPageShell";
import { AchievementsPanel, ACHIEVEMENT_NAV_SECTIONS } from "./AchievementsPanel";

export function AchievementsPage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>("all");

  return (
    <AppPageShell
      title={t("page.achievements.title")}
      subtitle={t("page.achievements.subtitle")}
      navItems={ACHIEVEMENT_NAV_SECTIONS.map((section) => ({
        id: section.id,
        label: t(section.labelKey),
      }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
    >
      <AchievementsPanel activeSection={activeSection} />
    </AppPageShell>
  );
}
