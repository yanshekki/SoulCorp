import { useI18n } from "../../i18n/I18nProvider";

export function PanelSuspense() {
  const { t } = useI18n();
  return (
    <div className="app-stage-transition panel-suspense" role="status" aria-live="polite">
      <div className="panel-suspense-inner">
        <span className="panel-suspense-spinner" aria-hidden="true" />
        <p className="muted">{t("panel.loading")}</p>
      </div>
    </div>
  );
}
