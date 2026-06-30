import { useState } from "react";
import { deleteCompany, switchCompany } from "../../services/companyClient";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { useGameStore } from "../../stores/gameStore";

export function CompanySwitcher() {
  const companies = useGameStore((state) => state.companies);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const onboardingCompleted = useGameStore((state) => state.onboardingCompleted);
  const setShowCreateCompany = useGameStore((state) => state.setShowCreateCompany);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [busy, setBusy] = useState(false);

  if (!onboardingCompleted || companies.length === 0) {
    return null;
  }

  const handleSwitch = async (companyId: string) => {
    if (companyId === activeCompanyId || busy) {
      return;
    }
    setBusy(true);
    try {
      await switchCompany(companyId);
      await reloadGameState();
      setStatusMessage("Switched company.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (companyId: string, companyName: string) => {
    if (busy || companies.length <= 1) {
      return;
    }
    const confirmed = window.confirm(`Delete "${companyName}" and its local workspace data?`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      await deleteCompany(companyId);
      await reloadGameState();
      setStatusMessage(`Deleted ${companyName}.`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="company-switcher">
      <label className="company-switcher-label" htmlFor="company-switcher-select">
        Company
      </label>
      <select
        id="company-switcher-select"
        className="company-switcher-select"
        value={activeCompanyId ?? ""}
        disabled={busy}
        onChange={(event) => void handleSwitch(event.target.value)}
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
            {company.industry ? ` · ${company.industry}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="company-switcher-new"
        disabled={busy}
        onClick={() => setShowCreateCompany(true)}
      >
        New
      </button>
      {companies.length > 1 && activeCompanyId ? (
        <button
          type="button"
          className="company-switcher-delete"
          disabled={busy}
          onClick={() => {
            const active = companies.find((company) => company.id === activeCompanyId);
            if (active) {
              void handleDelete(active.id, active.name);
            }
          }}
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}