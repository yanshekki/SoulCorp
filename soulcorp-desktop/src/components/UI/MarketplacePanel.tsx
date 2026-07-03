import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptHubGig,
  completeHubGig,
  createHubGig,
  disputeHubGig,
  listGigContracts,
  listHubGigs,
  rejectGigQc,
  startGigWork,
  submitGigForQc,
  syncWithHub,
} from "../../services/hubClient";
import { simulationAutoRun } from "../../config/features";
import { useGameStore } from "../../stores/gameStore";
import type { GigContract, HubGig, TokenEconomy } from "../../types/game";
import { invoke } from "@tauri-apps/api/core";

export const MARKETPLACE_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "browse", label: "Browse gigs" },
  { id: "contracts", label: "My contracts" },
  { id: "history", label: "History" },
  { id: "publish", label: "Post a gig" },
] as const;

function qcBandLabel(score: number): string {
  if (score >= 0.9) return "Platinum";
  if (score >= 0.75) return "Gold";
  if (score >= 0.6) return "Silver";
  return "Bronze";
}

function statusLabel(status: string): string {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "in_progress":
      return "In progress";
    case "in_qc":
      return "QC review";
    case "disputed":
      return "Disputed";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

interface MarketplacePanelProps {
  onSectionFocus?: (sectionId: string) => void;
  onNavigateSection?: (sectionId: string) => void;
}

export function MarketplacePanel({ onSectionFocus, onNavigateSection }: MarketplacePanelProps) {
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setFinance = useGameStore((state) => state.setFinance);

  const [executiveLoungeOnly, setExecutiveLoungeOnly] = useState(false);
  const [gigs, setGigs] = useState<HubGig[]>([]);
  const [contracts, setContracts] = useState<GigContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [gigsFromCache, setGigsFromCache] = useState(false);
  const [gigsCacheMessage, setGigsCacheMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(250);
  const [skills, setSkills] = useState("react, tailwind");
  const scrollRootRef = useRef<HTMLDivElement | null>(null);

  const refreshFinance = useCallback(async () => {
    const finance = await invoke<TokenEconomy>("get_finance_state");
    setFinance(finance);
  }, [setFinance]);

  const refreshContracts = useCallback(async () => {
    const next = await listGigContracts();
    setContracts(next);
    return next;
  }, []);

  const refreshGigs = useCallback(async () => {
    setLoading(true);
    try {
      const [gigResult, nextContracts] = await Promise.all([listHubGigs(), listGigContracts()]);
      setGigs(gigResult.gigs);
      setGigsFromCache(gigResult.from_cache);
      setGigsCacheMessage(gigResult.message ?? null);
      setContracts(nextContracts);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setLoading(false);
    }
  }, [setStatusMessage]);

  useEffect(() => {
    void refreshGigs();
  }, [activeCompanyId, refreshGigs]);

  useEffect(() => {
    if (!onSectionFocus) {
      return;
    }
    const root = scrollRootRef.current?.closest(".marketplace-page-scroll");
    const sections = scrollRootRef.current?.querySelectorAll("[data-marketplace-section]");
    if (!root || !sections?.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const sectionId = visible?.target.getAttribute("data-marketplace-section");
        if (sectionId) {
          onSectionFocus(sectionId);
        }
      },
      { root, rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onSectionFocus, gigs.length, contracts.length]);

  const activeContractGigIds = useMemo(
    () =>
      new Set(
        contracts
          .filter((contract) => contract.status !== "completed")
          .map((contract) => contract.gig_id),
      ),
    [contracts],
  );

  const browseGigs = useMemo(
    () =>
      gigs.filter(
        (gig) =>
          gig.status === "open" &&
          !activeContractGigIds.has(gig.gig_id) &&
          (!executiveLoungeOnly || gig.executive_lounge),
      ),
    [executiveLoungeOnly, gigs, activeContractGigIds],
  );

  const activeContracts = useMemo(
    () =>
      contracts.filter((contract) =>
        ["accepted", "in_progress", "in_qc", "disputed"].includes(contract.status),
      ),
    [contracts],
  );

  const historyContracts = useMemo(
    () =>
      [...contracts]
        .filter((contract) => contract.status === "completed")
        .sort((left, right) => (right.completed_at ?? "").localeCompare(left.completed_at ?? "")),
    [contracts],
  );

  const handleSync = async () => {
    try {
      const pull = await syncWithHub();
      setGigs(pull.open_gigs);
      setGigsFromCache(false);
      setGigsCacheMessage(null);
      setHubStatus({
        ...hubStatus,
        connected: true,
        user_tier: pull.tier,
        soul_balance: pull.soul_balance,
        pending_queue_items: 0,
        last_sync_at: new Date().toISOString(),
      });
      setStatusMessage(`Synced with hub. Tier: ${pull.tier}, $SOUL: ${pull.soul_balance.toFixed(2)}`);
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleCreateGig = async () => {
    if (!title.trim() || !description.trim()) {
      setStatusMessage("Title and description are required.");
      return;
    }

    try {
      const result = await createHubGig({
        title: title.trim(),
        description: description.trim(),
        budget_usdt: budget,
        required_skills: skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
      });
      const message =
        typeof result.message === "string"
          ? result.message
          : result.queued
            ? "Gig queued locally for next hub sync."
            : "Gig submitted to hub.";
      setStatusMessage(message);
      setTitle("");
      setDescription("");
      await refreshGigs();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleAccept = async (gigId: number) => {
    try {
      const contract = await acceptHubGig(gigId);
      setStatusMessage(`Accepted gig: ${contract.title}`);
      await refreshGigs();
      onNavigateSection?.("contracts");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleStart = async (contractId: string) => {
    try {
      const contract = await startGigWork(contractId);
      setStatusMessage(
        simulationAutoRun
          ? `Started work on ${contract.title}. Progress advances during simulation ticks.`
          : `Started work on ${contract.title}. Progress advances when task deliverables complete.`,
      );
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleSubmitQc = async (contractId: string) => {
    try {
      const contract = await submitGigForQc(contractId);
      setStatusMessage(
        `Submitted ${contract.title} for QC. Score ${((contract.qc_score ?? 0) * 100).toFixed(0)}%.`,
      );
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleComplete = async (contractId: string) => {
    try {
      const contract = await completeHubGig(contractId);
      await refreshFinance();
      setStatusMessage(
        `QC approved — ${contract.title}. Net payout $${contract.payout_usdt.toFixed(2)} USDT (fee $${contract.platform_fee_usdt.toFixed(2)}).`,
      );
      await refreshContracts();
      onNavigateSection?.("history");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleRejectQc = async (contractId: string) => {
    const notes = window.prompt("QC rejection notes (optional):");
    if (notes === null) return;
    try {
      const contract = await rejectGigQc(contractId, notes.trim() || undefined);
      setStatusMessage(
        `QC rejected for ${contract.title}. Revision required — ${contract.qc_notes ?? "Improve deliverable."}`,
      );
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleDispute = async (contractId: string) => {
    const notes = window.prompt("Dispute reason (optional):");
    if (notes === null) return;
    try {
      const contract = await disputeHubGig(contractId, notes.trim() || undefined);
      setStatusMessage(`Dispute opened for ${contract.title}. Platform mediation pending.`);
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="marketplace-panel marketplace-panel--page" ref={scrollRootRef}>
      <section
        id="overview"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="overview"
      >
        <header className="marketplace-card-header marketplace-card-header--stacked">
          <h3>Marketplace overview</h3>
          <p className="muted">
            Hub connection, platform fee, and your gig pipeline at a glance. Platform fee:{" "}
            {tierBenefits.platform_fee_percent.toFixed(0)}%.
          </p>
        </header>

        {tierBenefits.executive_lounge ? (
          <p className="tier-highlight">Executive Lounge gigs are visible on your tier.</p>
        ) : null}

        <div className="hub-status-row hub-sync-status">
          <span className={`hub-pill ${hubStatus.connected ? "online" : "offline"}`}>
            {hubStatus.connected ? "Connected" : "Offline"}
          </span>
          <span className="hub-pill tier">{hubStatus.user_tier}</span>
          <span className="hub-pill balance">${hubStatus.soul_balance.toFixed(2)} SOUL</span>
          {hubStatus.pending_queue_items > 0 ? (
            <span className="hub-pill queue">{hubStatus.pending_queue_items} queued</span>
          ) : null}
          {hubStatus.last_sync_at ? (
            <span className="hub-pill muted">
              Synced {new Date(hubStatus.last_sync_at).toLocaleString()}
            </span>
          ) : null}
        </div>

        {settings.pure_local_mode ? (
          <p className="hub-warning">
            Pure Local Mode is on. Browse cached hub gigs from your last sync, or manage local
            contracts.
          </p>
        ) : null}
        {gigsFromCache && gigsCacheMessage ? (
          <p className="hub-warning" role="status">
            {gigsCacheMessage}
          </p>
        ) : null}

        <div className="analytics-grid marketplace-stats-grid">
          <article>
            <strong>{browseGigs.length}</strong>
            <span>Open gigs</span>
          </article>
          <article>
            <strong>{activeContracts.length}</strong>
            <span>Active contracts</span>
          </article>
          <article>
            <strong>{historyContracts.length}</strong>
            <span>Completed</span>
          </article>
          <article>
            <strong>{tierBenefits.platform_fee_percent.toFixed(0)}%</strong>
            <span>Platform fee</span>
          </article>
        </div>

        <div className="marketplace-card-actions">
          <button type="button" className="secondary-action" onClick={() => void refreshGigs()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => void handleSync()}
            disabled={settings.pure_local_mode}
          >
            Sync with hub
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => onNavigateSection?.("publish")}
            disabled={settings.pure_local_mode}
          >
            Post a gig
          </button>
        </div>
      </section>

      <section
        id="browse"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="browse"
      >
        <header className="marketplace-card-header">
          <div>
            <h3>Browse gigs</h3>
            <p className="muted marketplace-card-subtitle">
              Accept open contracts from soulmd-hub.
              {simulationAutoRun
                ? " Progress advances during simulation ticks."
                : " Progress advances when backlog deliverables complete."}
            </p>
          </div>
          <span className="marketplace-count-pill">{browseGigs.length} available</span>
        </header>

        {tierBenefits.executive_lounge ? (
          <label className="checkbox-row executive-lounge-filter">
            <input
              type="checkbox"
              checked={executiveLoungeOnly}
              onChange={(event) => setExecutiveLoungeOnly(event.target.checked)}
            />
            <span>Executive Lounge gigs only</span>
          </label>
        ) : null}

        {browseGigs.length === 0 ? (
          <p className="muted">
            {loading ? "Loading gigs from hub…" : "No open gigs available. Sync with hub or post your own."}
          </p>
        ) : (
          <div className="gig-list marketplace-gig-grid">
            {browseGigs.map((gig) => (
              <article key={gig.gig_id} className="gig-card marketplace-gig-card">
                <header>
                  <strong>{gig.title}</strong>
                  <span>${gig.budget_usdt.toFixed(0)} USDT</span>
                </header>
                <p>{gig.description}</p>
                <div className="skill-tags">
                  {gig.required_skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
                <footer className="gig-card-footer">
                  <span className="gig-status-badge status-open">
                    {gig.executive_lounge ? "Executive Lounge" : "Open"}
                  </span>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void handleAccept(gig.gig_id)}
                  >
                    Accept gig
                  </button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        id="contracts"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="contracts"
      >
        <header className="marketplace-card-header">
          <div>
            <h3>My contracts</h3>
            <p className="muted marketplace-card-subtitle">
              Active work — start delivery, submit for QC, approve payouts, or open disputes.
            </p>
          </div>
          <span className="marketplace-count-pill">{activeContracts.length} active</span>
        </header>

        {activeContracts.length === 0 ? (
          <p className="muted">No active contracts. Accept a gig from Browse.</p>
        ) : (
          <div className="gig-list marketplace-gig-grid">
            {activeContracts.map((contract) => (
              <article key={contract.contract_id} className="gig-card marketplace-gig-card">
                <header>
                  <strong>{contract.title}</strong>
                  <span>${contract.budget_usdt.toFixed(0)} USDT</span>
                </header>
                <p>{contract.description}</p>
                <div className="gig-progress-row">
                  <div className="gig-progress-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(contract.progress * 100)}%` }} />
                  </div>
                  <span className="gig-progress-label">{Math.round(contract.progress * 100)}%</span>
                </div>
                {contract.qc_score != null ? (
                  <p className="gig-qc-score">
                    <span
                      className={`qc-band-badge band-${qcBandLabel(contract.qc_score).toLowerCase()}`}
                    >
                      {qcBandLabel(contract.qc_score)}
                    </span>{" "}
                    QC score: {(contract.qc_score * 100).toFixed(0)}%
                    {contract.submitted_at
                      ? ` · Submitted ${new Date(contract.submitted_at).toLocaleString()}`
                      : null}
                  </p>
                ) : null}
                {contract.qc_notes ? <p className="gig-qc-notes">{contract.qc_notes}</p> : null}
                <footer className="gig-card-footer gig-card-footer-qc">
                  <span className={`gig-status-badge status-${contract.status}`}>
                    {statusLabel(contract.status)}
                  </span>
                  {contract.status === "accepted" ? (
                    <button type="button" onClick={() => void handleStart(contract.contract_id)}>
                      Start work
                    </button>
                  ) : null}
                  {contract.status === "in_progress" ? (
                    <>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={() => void handleSubmitQc(contract.contract_id)}
                        disabled={contract.progress < 0.95}
                      >
                        Submit for QC
                      </button>
                      <button type="button" onClick={() => void handleDispute(contract.contract_id)}>
                        Dispute
                      </button>
                    </>
                  ) : null}
                  {contract.status === "in_qc" ? (
                    <>
                      <button
                        type="button"
                        className="primary-action"
                        onClick={() => void handleComplete(contract.contract_id)}
                      >
                        Approve QC &amp; payout
                      </button>
                      <button type="button" onClick={() => void handleRejectQc(contract.contract_id)}>
                        Request revision
                      </button>
                      <button type="button" onClick={() => void handleDispute(contract.contract_id)}>
                        Dispute
                      </button>
                    </>
                  ) : null}
                  {contract.status === "disputed" ? (
                    <span className="muted">Awaiting platform mediation</span>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        id="history"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="history"
      >
        <header className="marketplace-card-header">
          <div>
            <h3>Completed gigs</h3>
            <p className="muted marketplace-card-subtitle">
              Payout history after QC approval — budget, platform fee, and net USDT received.
            </p>
          </div>
          <span className="marketplace-count-pill">{historyContracts.length} completed</span>
        </header>

        {historyContracts.length === 0 ? (
          <p className="muted">Completed gigs will appear here with payout details.</p>
        ) : (
          <div className="gig-list marketplace-gig-grid marketplace-history-grid">
            {historyContracts.map((contract) => (
              <article key={contract.contract_id} className="gig-card gig-card-history marketplace-gig-card">
                <header>
                  <strong>{contract.title}</strong>
                  <span>+${contract.payout_usdt.toFixed(2)}</span>
                </header>
                <p>
                  Budget ${contract.budget_usdt.toFixed(0)} · Fee ${contract.platform_fee_usdt.toFixed(2)} ·{" "}
                  {contract.completed_at
                    ? new Date(contract.completed_at).toLocaleString()
                    : "Completed"}
                </p>
                <span className="gig-status-badge status-completed">Completed</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        id="publish"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="publish"
      >
        <header className="marketplace-card-header marketplace-card-header--stacked">
          <h3>Post a gig</h3>
          <p className="muted">
            Publish work to soulmd-hub. Gigs queue locally when offline and sync on next hub pull.
          </p>
        </header>

        <div className="gig-form marketplace-publish-form">
          <label className="field-label">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={settings.pure_local_mode}
              placeholder="Landing page redesign"
            />
          </label>
          <label className="field-label">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              disabled={settings.pure_local_mode}
              placeholder="Scope, deliverables, and acceptance criteria…"
            />
          </label>
          <div className="marketplace-publish-fields">
            <label className="field-label">
              Budget (USDT)
              <input
                type="number"
                min={50}
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
                disabled={settings.pure_local_mode}
              />
            </label>
            <label className="field-label">
              Required skills (comma-separated)
              <input
                type="text"
                value={skills}
                onChange={(event) => setSkills(event.target.value)}
                disabled={settings.pure_local_mode}
              />
            </label>
          </div>
          <button
            type="button"
            className="primary-action"
            onClick={() => void handleCreateGig()}
            disabled={settings.pure_local_mode}
          >
            Publish gig
          </button>
        </div>
      </section>
    </div>
  );
}