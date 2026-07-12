import { useEffect } from "react";
import { clearEmptyGameState } from "../../utils/companyState";
import { useGameStore } from "../../stores/gameStore";
import { useI18n } from "../../i18n/I18nProvider";
import { CreateCompanyModal } from "./CreateCompanyModal";

export function CompanySetupGate() {
  const { t } = useI18n();
  const setShowCreateCompany = useGameStore((state) => state.setShowCreateCompany);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    clearEmptyGameState();
    setStatusMessage(t("status.createCompany"));
  }, [setStatusMessage, t]);

  return (
    <div className="company-setup-gate">
      <div className="company-setup-card">
        <p className="modal-eyebrow">{t("setup.noCompany")}</p>
        <h2>{t("setup.title")}</h2>
        <p className="muted">{t("setup.desc")}</p>
        <div className="company-setup-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => setShowCreateCompany(true)}
          >
            {t("setup.create")}
          </button>
          <p className="muted">{t("setup.afterCreate")}</p>
        </div>
      </div>
      <CreateCompanyModal />
    </div>
  );
}