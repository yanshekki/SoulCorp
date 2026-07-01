import { useEffect, useRef, useState } from "react";
import { deleteCompany, switchCompany } from "../../services/companyClient";
import { reloadGameState } from "../../hooks/useReloadGameState";
import { useGameStore } from "../../stores/gameStore";
import { reportLocalProgress } from "../../stores/progressStore";

export function CompanySwitcher() {
  const companies = useGameStore((state) => state.companies);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const companyName = useGameStore((state) => state.companyName);
  const onboardingCompleted = useGameStore((state) => state.onboardingCompleted);
  const setShowCreateCompany = useGameStore((state) => state.setShowCreateCompany);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (!onboardingCompleted) {
    return null;
  }

  const activeCompany = companies.find((company) => company.id === activeCompanyId);
  const displayName =
    activeCompany?.name ||
    companyName ||
    (companies.length > 0 ? "Select company" : "No companies");

  const handleSwitch = async (companyId: string) => {
    if (companyId === activeCompanyId || busy) {
      return;
    }
    setBusy(true);
    setOpen(false);
    reportLocalProgress("company_switch", "Switching company…", 5, "switch");
    try {
      await switchCompany(companyId);
      await reloadGameState("company_switch");
      setStatusMessage("Switched company.");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (companyId: string, name: string) => {
    if (busy || companies.length <= 1) {
      return;
    }
    const confirmed = window.confirm(`Delete "${name}" and its local workspace data?`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setOpen(false);
    try {
      await deleteCompany(companyId);
      await reloadGameState();
      setStatusMessage(`Deleted ${name}.`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="company-switcher" ref={rootRef}>
      <span className="company-switcher-label">Company</span>
      <div className="company-switcher-control">
        <button
          type="button"
          className="company-switcher-trigger"
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={busy || companies.length === 0}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="company-switcher-current">
            <span className="company-switcher-name">{displayName}</span>
            {activeCompany?.industry ? (
              <span className="company-switcher-meta">{activeCompany.industry}</span>
            ) : null}
          </span>
          <span className="company-switcher-chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        {open && companies.length > 0 ? (
          <div className="company-switcher-menu" role="menu">
            {companies.map((company) => {
              const isActive = company.id === activeCompanyId;
              return (
                <button
                  key={company.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className={`company-switcher-option${isActive ? " active" : ""}`}
                  disabled={busy}
                  onClick={() => void handleSwitch(company.id)}
                >
                  <span className="company-switcher-option-name">{company.name}</span>
                  {company.industry ? (
                    <span className="company-switcher-option-meta">{company.industry}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
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
            if (activeCompany) {
              void handleDelete(activeCompany.id, activeCompany.name);
            }
          }}
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}