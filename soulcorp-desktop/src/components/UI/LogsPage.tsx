import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { mapSections } from "../../i18n/sectionLabels";
import { AppPageShell } from "./AppPageShell";
import { LogsPanel } from "./logs/LogsPanel";

export const LOGS_SECTIONS = [
  { id: "viewer", label: "Log viewer", hint: "Search & filter" },
  { id: "about", label: "About", hint: "How logs work" },
] as const;

export function LogsPage() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<string>(LOGS_SECTIONS[0].id);
  const navItems = useMemo(() => mapSections(t, "logs", LOGS_SECTIONS), [t]);

  return (
    <AppPageShell
      title={t("page.logs.title")}
      subtitle={t("page.logs.subtitle")}
      badge={t("nav.group.system")}
      navItems={navItems.map((section) => ({
        id: section.id,
        label: section.label,
        hint: section.hint,
      }))}
      activeNavId={activeSection}
      onNavSelect={setActiveSection}
    >
      <div className="settings-panel settings-panel--page logs-page">
        <div className="settings-grid">
          {activeSection === "viewer" ? (
            <section className="settings-card settings-card--wide">
              <header className="settings-card-header">
                <h3>{t("logs.viewerTitle")}</h3>
                <p className="muted">{t("logs.viewerDesc")}</p>
              </header>
              <div className="settings-card-body">
                <LogsPanel />
              </div>
            </section>
          ) : null}

          {activeSection === "about" ? (
            <section className="settings-card settings-card--wide">
              <header className="settings-card-header">
                <h3>{t("logs.aboutTitle")}</h3>
                <p className="muted">{t("logs.aboutDesc")}</p>
              </header>
              <div className="settings-card-body">
                <ul className="settings-info-list">
                  <li>{t("logs.about.categories")}</li>
                  <li>{t("logs.about.levels")}</li>
                  <li>{t("logs.about.storage")}</li>
                  <li>{t("logs.about.cap")}</li>
                  <li>{t("logs.about.redact")}</li>
                  <li>{t("logs.about.auto")}</li>
                  <li>{t("logs.about.sources")}</li>
                  <li>{t("logs.about.export")}</li>
                </ul>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </AppPageShell>
  );
}
