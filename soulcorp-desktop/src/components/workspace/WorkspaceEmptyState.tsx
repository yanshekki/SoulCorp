import { useI18n } from "../../i18n/I18nProvider";

interface WorkspaceEmptyStateProps {
  error?: string | null;
  onCreatePage?: () => void;
}

export function WorkspaceEmptyState({ error, onCreatePage }: WorkspaceEmptyStateProps) {
  const { t } = useI18n();

  if (error) {
    return (
      <div className="ws-empty-state ws-empty-state--error">
        <div className="ws-empty-icon" aria-hidden="true">
          ⚠
        </div>
        <h2>{t("workspace.empty.errorTitle")}</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="ws-empty-state">
      <div className="ws-empty-icon" aria-hidden="true">
        📄
      </div>
      <h2>{t("workspace.empty.title")}</h2>
      <p className="ws-empty-lead">{t("workspace.empty.lead")}</p>
      <ul className="ws-empty-features">
        <li>
          <strong>{t("workspace.empty.feat.blocks")}</strong>
          {" — "}
          {t("workspace.empty.feat.blocksDesc")}
        </li>
        <li>
          <strong>{t("workspace.empty.feat.links")}</strong>
          {" — "}
          {t("workspace.empty.feat.linksDesc")}
        </li>
        <li>
          <strong>{t("workspace.empty.feat.files")}</strong>
          {" — "}
          {t("workspace.empty.feat.filesDesc")}
        </li>
        <li>
          <strong>{t("workspace.empty.feat.autosave")}</strong>
          {" — "}
          {t("workspace.empty.feat.autosaveDesc")}
        </li>
      </ul>
      {onCreatePage ? (
        <button type="button" className="ws-empty-cta" onClick={onCreatePage}>
          {t("workspace.empty.cta")}
        </button>
      ) : (
        <p className="muted">{t("workspace.empty.hint")}</p>
      )}
    </div>
  );
}
