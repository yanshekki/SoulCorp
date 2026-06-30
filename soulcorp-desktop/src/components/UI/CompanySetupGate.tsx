import { useEffect } from "react";
import { clearEmptyGameState } from "../../utils/companyState";
import { useGameStore } from "../../stores/gameStore";
import { CreateCompanyModal } from "./CreateCompanyModal";

export function CompanySetupGate() {
  const setShowCreateCompany = useGameStore((state) => state.setShowCreateCompany);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);

  useEffect(() => {
    clearEmptyGameState();
    setStatusMessage("Create or select a company to start.");
  }, [setStatusMessage]);

  return (
    <div className="company-setup-gate">
      <div className="company-setup-card">
        <p className="modal-eyebrow">No active company</p>
        <h2>Set up your company</h2>
        <p className="muted">
          Create a company profile before viewing agents, finance, or the 3D office.
        </p>
        <div className="company-setup-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => setShowCreateCompany(true)}
          >
            Create company
          </button>
          <p className="muted">
            After creating, use <strong>3D Design</strong> in the top nav to customize buildings,
            offices, and agent appearances.
          </p>
        </div>
      </div>
      <CreateCompanyModal />
    </div>
  );
}