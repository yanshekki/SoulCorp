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
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAutopilotSnapshot } from "../../hooks/useAutopilotSnapshot";
import { useGameStore } from "../../stores/gameStore";
import type { GigContract, HubGig, TokenEconomy } from "../../types/game";
import { MARKETPLACE_SEARCH_TYPES } from "../../data/searchFilterOptions";
import { filterByScopedQuery, SEARCH_TYPE_ALL } from "../../utils/searchTypeFilters";
import { paginateItems } from "../../utils/pagination";
import { invoke } from "../../utils/tauriInvoke";
import { useI18n } from "../../i18n/I18nProvider";
import { PaginationBar } from "./PaginationBar";
import { SearchableListToolbar } from "./SearchableListToolbar";

const MARKETPLACE_PAGE_SIZE = 12;

export const MARKETPLACE_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "browse", label: "Browse gigs" },
  { id: "contracts", label: "My contracts" },
  { id: "history", label: "History" },
  { id: "publish", label: "Post a gig" },
] as const;

function qcBandKey(score: number): string {
  if (score >= 0.9) return "marketplace.band.platinum";
  if (score >= 0.75) return "marketplace.band.gold";
  if (score >= 0.6) return "marketplace.band.silver";
  return "marketplace.band.bronze";
}

function qcBandCss(score: number): string {
  if (score >= 0.9) return "platinum";
  if (score >= 0.75) return "gold";
  if (score >= 0.6) return "silver";
  return "bronze";
}

function statusLabelKey(status: string): string {
  switch (status) {
    case "accepted":
      return "marketplace.status.accepted";
    case "in_progress":
      return "marketplace.status.inProgress";
    case "in_qc":
      return "marketplace.status.inQc";
    case "disputed":
      return "marketplace.status.disputed";
    case "completed":
      return "marketplace.status.completed";
    default:
      return status;
  }
}

interface MarketplacePanelProps {
  activeSection: string;
  onNavigateSection?: (sectionId: string) => void;
}

export function MarketplacePanel({ activeSection, onNavigateSection }: MarketplacePanelProps) {
  const { t } = useI18n();
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const tierBenefits = useGameStore((state) => state.tierBenefits);
  const setHubStatus = useGameStore((state) => state.setHubStatus);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setFinance = useGameStore((state) => state.setFinance);

  const [executiveLoungeOnly, setExecutiveLoungeOnly] = useState(false);
  const [marketplaceSearchQuery, setMarketplaceSearchQuery] = useState("");
  const [marketplaceSearchType, setMarketplaceSearchType] = useState(SEARCH_TYPE_ALL);
  const [browsePage, setBrowsePage] = useState(0);
  const [contractsPage, setContractsPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const debouncedMarketplaceQuery = useDebouncedValue(marketplaceSearchQuery);
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
  const { snapshot: autopilotSnapshot } = useAutopilotSnapshot();

  const refreshFinance = useCallback(async () => {
    const finance = await invoke<TokenEconomy>("get_finance_state");
    setFinance(finance);
  }, [setFinance]);

  const refreshContracts = useCallback(async () => {
    const next = await listGigContracts();
    setContracts(next);
    return next;
  }, []);

  const hasMarketplaceDataRef = useRef(false);

  const refreshGigs = useCallback(async () => {
    // Only show full loading when we have nothing to display — keep cards mounted on refresh.
    const showLoading = !hasMarketplaceDataRef.current;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [gigResult, nextContracts] = await Promise.all([listHubGigs(), listGigContracts()]);
      hasMarketplaceDataRef.current = true;
      setGigs(gigResult.gigs);
      setGigsFromCache(gigResult.from_cache);
      setGigsCacheMessage(gigResult.message ?? null);
      setContracts(nextContracts);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [setStatusMessage]);

  useEffect(() => {
    hasMarketplaceDataRef.current = false;
    void refreshGigs();
  }, [activeCompanyId, refreshGigs]);


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

  const marketplaceResolvers = {
    all: (item: {
      title: string;
      description: string;
      required_skills?: string[];
      gig_id?: number;
      status?: string;
      contract_id?: string;
    }) => [
      item.title,
      item.description,
      ...(item.required_skills ?? []),
      item.gig_id != null ? String(item.gig_id) : "",
      item.contract_id ?? "",
      item.status ?? "",
    ],
    title: (item: { title: string }) => [item.title],
    description: (item: { description: string }) => [item.description],
    skills: (item: { required_skills?: string[] }) => item.required_skills ?? [],
    status: (item: { status?: string }) => [item.status ?? ""],
  };

  const searchedBrowseGigs = useMemo(
    () =>
      filterByScopedQuery(
        browseGigs,
        debouncedMarketplaceQuery,
        marketplaceSearchType,
        marketplaceResolvers,
      ),
    [browseGigs, debouncedMarketplaceQuery, marketplaceSearchType],
  );

  const searchedActiveContracts = useMemo(
    () =>
      filterByScopedQuery(
        activeContracts,
        debouncedMarketplaceQuery,
        marketplaceSearchType,
        marketplaceResolvers,
      ),
    [activeContracts, debouncedMarketplaceQuery, marketplaceSearchType],
  );

  const searchedHistoryContracts = useMemo(
    () =>
      filterByScopedQuery(
        historyContracts,
        debouncedMarketplaceQuery,
        marketplaceSearchType,
        marketplaceResolvers,
      ),
    [historyContracts, debouncedMarketplaceQuery, marketplaceSearchType],
  );

  const browsePagination = useMemo(
    () => paginateItems(searchedBrowseGigs, browsePage, MARKETPLACE_PAGE_SIZE),
    [searchedBrowseGigs, browsePage],
  );

  const contractsPagination = useMemo(
    () => paginateItems(searchedActiveContracts, contractsPage, MARKETPLACE_PAGE_SIZE),
    [searchedActiveContracts, contractsPage],
  );

  const historyPagination = useMemo(
    () => paginateItems(searchedHistoryContracts, historyPage, MARKETPLACE_PAGE_SIZE),
    [searchedHistoryContracts, historyPage],
  );

  useEffect(() => {
    setBrowsePage(0);
    setContractsPage(0);
    setHistoryPage(0);
  }, [debouncedMarketplaceQuery, marketplaceSearchType]);

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
      setStatusMessage(t("marketplace.msg.synced", { tier: pull.tier, soul: pull.soul_balance.toFixed(2) }));
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleCreateGig = async () => {
    if (!title.trim() || !description.trim()) {
      setStatusMessage(t("marketplace.msg.titleRequired"));
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
            ? t("marketplace.msg.queued")
            : t("marketplace.msg.submitted");
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
      setStatusMessage(t("marketplace.msg.accepted", { title: contract.title }));
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
          ? t("marketplace.msg.startedSim", { title: contract.title })
          : t("marketplace.msg.started", { title: contract.title }),
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
        t("marketplace.msg.submittedQc", {
          title: contract.title,
          score: ((contract.qc_score ?? 0) * 100).toFixed(0),
        }),
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
        t("marketplace.msg.qcApproved", {
          title: contract.title,
          payout: contract.payout_usdt.toFixed(2),
          fee: contract.platform_fee_usdt.toFixed(2),
        }),
      );
      await refreshContracts();
      onNavigateSection?.("history");
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleRejectQc = async (contractId: string) => {
    const notes = window.prompt(t("marketplace.prompt.qcReject"));
    if (notes === null) return;
    try {
      const contract = await rejectGigQc(contractId, notes.trim() || undefined);
      setStatusMessage(
        t("marketplace.msg.qcRejected", {
          title: contract.title,
          notes: contract.qc_notes ?? t("marketplace.msg.improve"),
        }),
      );
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const handleDispute = async (contractId: string) => {
    const notes = window.prompt(t("marketplace.prompt.dispute"));
    if (notes === null) return;
    try {
      const contract = await disputeHubGig(contractId, notes.trim() || undefined);
      setStatusMessage(t("marketplace.msg.disputeOpened", { title: contract.title }));
      await refreshContracts();
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  return (
    <div className="marketplace-panel marketplace-panel--page" ref={scrollRootRef}>
      {activeSection === "overview" ? (
      <section
        id="overview"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="overview"
      >
        <header className="marketplace-card-header marketplace-card-header--stacked">
          <h3>{t("marketplace.overviewTitle")}</h3>
          <p className="muted">
            {t("marketplace.overviewDesc", { fee: tierBenefits.platform_fee_percent.toFixed(0) })}
          </p>
        </header>

        {autopilotSnapshot &&
        (autopilotSnapshot.deliverables_this_week > 0 ||
          autopilotSnapshot.gigs_advanced_this_week > 0) ? (
          <p className="marketplace-autopilot-hint muted">
            {t("marketplace.weekDeliverables", {
              n: autopilotSnapshot.deliverables_this_week,
              gigs:
                autopilotSnapshot.gigs_advanced_this_week > 0
                  ? t("marketplace.weekGigs", { n: autopilotSnapshot.gigs_advanced_this_week })
                  : "",
            })}
          </p>
        ) : null}

        <div className="hub-status-row hub-sync-status">
          <span className={`hub-pill ${hubStatus.connected ? "online" : "offline"}`}>
            {hubStatus.connected ? t("marketplace.connected") : t("marketplace.offline")}
          </span>
          <span className="hub-pill tier">{hubStatus.user_tier}</span>
          <span className="hub-pill balance">${hubStatus.soul_balance.toFixed(2)} SOUL</span>
          {hubStatus.pending_queue_items > 0 ? (
            <span className="hub-pill queue">{t("marketplace.queued", { n: hubStatus.pending_queue_items })}</span>
          ) : null}
          {hubStatus.last_sync_at ? (
            <span className="hub-pill muted">
              {t("marketplace.syncedAt", { when: new Date(hubStatus.last_sync_at).toLocaleString() })}
            </span>
          ) : null}
        </div>

        {settings.pure_local_mode ? (
          <p className="hub-warning">{t("marketplace.pureLocalNote")}</p>
        ) : null}
        {gigsFromCache && gigsCacheMessage ? (
          <p className="hub-warning" role="status">
            {gigsCacheMessage}
          </p>
        ) : null}

        <div className="analytics-grid marketplace-stats-grid">
          <article>
            <strong>{browseGigs.length}</strong>
            <span>{t("marketplace.openGigs")}</span>
          </article>
          <article>
            <strong>{activeContracts.length}</strong>
            <span>{t("marketplace.activeContracts")}</span>
          </article>
          <article>
            <strong>{historyContracts.length}</strong>
            <span>{t("marketplace.completed")}</span>
          </article>
          <article>
            <strong>{tierBenefits.platform_fee_percent.toFixed(0)}%</strong>
            <span>{t("marketplace.platformFee")}</span>
          </article>
        </div>

        <div className="marketplace-card-actions">
          <button type="button" className="secondary-action" onClick={() => void refreshGigs()} disabled={loading}>
            {loading ? t("marketplace.loading") : t("marketplace.refresh")}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => void handleSync()}
            disabled={settings.pure_local_mode}
          >
            {t("marketplace.syncHub")}
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => onNavigateSection?.("publish")}
            disabled={settings.pure_local_mode}
          >
            {t("marketplace.postGig")}
          </button>
        </div>
      </section>
      ) : null}

      {activeSection === "browse" ? (
      <section
        id="browse"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="browse"
      >
        <header className="marketplace-card-header">
          <div>
            <h3>{t("marketplace.browseTitle")}</h3>
            <p className="muted marketplace-card-subtitle">
              {t("marketplace.browseDesc")}
              {simulationAutoRun
                ? t("marketplace.browseDescSim")
                : t("marketplace.browseDescBacklog")}
            </p>
          </div>
          <span className="marketplace-count-pill">
            {debouncedMarketplaceQuery.trim()
              ? t("marketplace.matchesCount", { n: searchedBrowseGigs.length })
              : t("marketplace.availableCount", { n: browseGigs.length })}
          </span>
        </header>

        <SearchableListToolbar
          query={marketplaceSearchQuery}
          onQueryChange={setMarketplaceSearchQuery}
          placeholder={t("marketplace.searchPlaceholder")}
          ariaLabel={t("marketplace.searchPlaceholder")}
          typeFilter={{
            value: marketplaceSearchType,
            onChange: setMarketplaceSearchType,
            options: MARKETPLACE_SEARCH_TYPES,
            ariaLabel: t("marketplace.searchFieldAria"),
            label: t("marketplace.filterField"),
          }}
        />

        <label className="checkbox-row executive-lounge-filter">
          <input
            type="checkbox"
            checked={executiveLoungeOnly}
            onChange={(event) => setExecutiveLoungeOnly(event.target.checked)}
          />
          <span>{t("marketplace.executiveOnly")}</span>
        </label>

        {browseGigs.length === 0 ? (
          <p className="muted">
            {loading ? t("marketplace.loadingGigs") : t("marketplace.noGigs")}
          </p>
        ) : debouncedMarketplaceQuery.trim() && searchedBrowseGigs.length === 0 ? (
          <p className="search-empty-hint muted">
            {t("marketplace.noMatches", { query: debouncedMarketplaceQuery })}
          </p>
        ) : (
          <>
          <div className="gig-list marketplace-gig-grid">
            {browsePagination.pageItems.map((gig) => (
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
                    {gig.executive_lounge ? t("marketplace.executiveLounge") : t("marketplace.openGig")}
                  </span>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => void handleAccept(gig.gig_id)}
                  >
                    {t("marketplace.acceptGig")}
                  </button>
                </footer>
              </article>
            ))}
          </div>
          <PaginationBar
            page={browsePagination.safePage}
            totalPages={browsePagination.totalPages}
            label={t("marketplace.browsePagination")}
            onPageChange={setBrowsePage}
          />
          </>
        )}
      </section>
      ) : null}

      {activeSection === "contracts" ? (
      <section
        id="contracts"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="contracts"
      >
        <header className="marketplace-card-header">
          <div>
            <h3>{t("marketplace.contractsTitle")}</h3>
            <p className="muted marketplace-card-subtitle">{t("marketplace.contractsDesc")}</p>
          </div>
          <span className="marketplace-count-pill">
            {debouncedMarketplaceQuery.trim()
              ? t("marketplace.matchesCount", { n: searchedActiveContracts.length })
              : t("marketplace.activeCount", { n: activeContracts.length })}
          </span>
        </header>

        {activeContracts.length === 0 ? (
          <p className="muted">{t("marketplace.noContracts")}</p>
        ) : debouncedMarketplaceQuery.trim() && searchedActiveContracts.length === 0 ? (
          <p className="search-empty-hint muted">
            {t("marketplace.noMatches", { query: debouncedMarketplaceQuery })}
          </p>
        ) : (
          <>
          <div className="gig-list marketplace-gig-grid">
            {contractsPagination.pageItems.map((contract) => (
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
                      className={`qc-band-badge band-${qcBandCss(contract.qc_score)}`}
                    >
                      {t(qcBandKey(contract.qc_score))}
                    </span>{" "}
                    {t("marketplace.qcScore", {
                      pct: (contract.qc_score * 100).toFixed(0),
                    })}
                    {contract.submitted_at
                      ? t("marketplace.submittedAt", {
                          when: new Date(contract.submitted_at).toLocaleString(),
                        })
                      : null}
                  </p>
                ) : null}
                {contract.qc_notes ? <p className="gig-qc-notes">{contract.qc_notes}</p> : null}
                <footer className="gig-card-footer gig-card-footer-qc">
                  <span className={`gig-status-badge status-${contract.status}`}>
                    {(() => { const k = statusLabelKey(contract.status); return k.startsWith("marketplace.") ? t(k) : k; })()}
                  </span>
                  {contract.status === "accepted" ? (
                    <button type="button" onClick={() => void handleStart(contract.contract_id)}>
                      {t("marketplace.startWork")}
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
                        {t("marketplace.submitQc")}
                      </button>
                      <button type="button" onClick={() => void handleDispute(contract.contract_id)}>
                        {t("marketplace.dispute")}
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
                        {t("marketplace.approveQc")}
                      </button>
                      <button type="button" onClick={() => void handleRejectQc(contract.contract_id)}>
                        {t("marketplace.requestRevision")}
                      </button>
                      <button type="button" onClick={() => void handleDispute(contract.contract_id)}>
                        {t("marketplace.dispute")}
                      </button>
                    </>
                  ) : null}
                  {contract.status === "disputed" ? (
                    <span className="muted">{t("marketplace.awaitingMediation")}</span>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
          <PaginationBar
            page={contractsPagination.safePage}
            totalPages={contractsPagination.totalPages}
            label={t("marketplace.contractsPagination")}
            onPageChange={setContractsPage}
          />
          </>
        )}
      </section>
      ) : null}

      {activeSection === "history" ? (
      <section
        id="history"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="history"
      >
        <header className="marketplace-card-header">
          <div>
            <h3>{t("marketplace.historyTitle")}</h3>
            <p className="muted marketplace-card-subtitle">{t("marketplace.historyDesc")}</p>
          </div>
          <span className="marketplace-count-pill">
            {debouncedMarketplaceQuery.trim()
              ? t("marketplace.matchesCount", { n: searchedHistoryContracts.length })
              : t("marketplace.completedCount", { n: historyContracts.length })}
          </span>
        </header>

        {historyContracts.length === 0 ? (
          <p className="muted">{t("marketplace.historyEmpty")}</p>
        ) : debouncedMarketplaceQuery.trim() && searchedHistoryContracts.length === 0 ? (
          <p className="search-empty-hint muted">
            {t("marketplace.noMatches", { query: debouncedMarketplaceQuery })}
          </p>
        ) : (
          <>
          <div className="gig-list marketplace-gig-grid marketplace-history-grid">
            {historyPagination.pageItems.map((contract) => (
              <article key={contract.contract_id} className="gig-card gig-card-history marketplace-gig-card">
                <header>
                  <strong>{contract.title}</strong>
                  <span>+${contract.payout_usdt.toFixed(2)}</span>
                </header>
                <p>
                  {t("marketplace.historyLine", {
                    budget: contract.budget_usdt.toFixed(0),
                    fee: contract.platform_fee_usdt.toFixed(2),
                    when: contract.completed_at
                      ? new Date(contract.completed_at).toLocaleString()
                      : t("marketplace.status.completed"),
                  })}
                </p>
                <span className="gig-status-badge status-completed">
                  {t("marketplace.status.completed")}
                </span>
              </article>
            ))}
          </div>
          <PaginationBar
            page={historyPagination.safePage}
            totalPages={historyPagination.totalPages}
            label={t("marketplace.historyPagination")}
            onPageChange={setHistoryPage}
          />
          </>
        )}
      </section>
      ) : null}

      {activeSection === "publish" ? (
      <section
        id="publish"
        className="marketplace-card marketplace-card--wide"
        data-marketplace-section="publish"
      >
        <header className="marketplace-card-header marketplace-card-header--stacked">
<h3>{t("marketplace.postTitle")}</h3>
          <p className="muted">{t("marketplace.postDesc")}</p>
        </header>

        <div className="gig-form marketplace-publish-form">
          <label className="field-label">
            {t("marketplace.gigTitle")}
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={settings.pure_local_mode}
              placeholder={t("marketplace.gigTitlePh")}
            />
          </label>
          <label className="field-label">
            {t("marketplace.gigDesc")}
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              disabled={settings.pure_local_mode}
              placeholder={t("marketplace.gigDescPh")}
            />
          </label>
          <div className="marketplace-publish-fields">
            <label className="field-label">
              {t("marketplace.budget")}
              <input
                type="number"
                min={50}
                value={budget}
                onChange={(event) => setBudget(Number(event.target.value))}
                disabled={settings.pure_local_mode}
              />
            </label>
            <label className="field-label">
              {t("marketplace.skills")}
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
            {t("marketplace.publishGig")}
          </button>
        </div>
      </section>
      ) : null}
    </div>
  );
}