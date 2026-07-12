import { invoke } from "../../utils/tauriInvoke";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../stores/gameStore";
import { totalCompanyTokens } from "../../utils/companyState";
import {
  clampRecruitSalary,
  monthlySalaryFromHourly,
  RECRUIT_SALARY_MAX,
  RECRUIT_SALARY_MIN,
} from "../../utils/recruitmentTokens";
import {
  buildCustomHireCandidate,
  buildSoulDraftFromCandidate,
  isCustomHireCandidate,
  isHubCandidate,
  resolveCandidateSoul,
} from "../../utils/candidateSoul";
import {
  preferredSoulTemplateForDepartment,
  soulTemplatesForDepartment,
  type SoulTemplateOption,
} from "../../utils/departmentSoulTemplates";
import type { AgentRecord, InternalProject, RecruitmentCandidate, TokenEconomy } from "../../types/game";
import { useCompanyDepartments } from "../../hooks/useCompanyDepartments";
import { listProjects } from "../../services/scrumClient";
import {
  finishProgress,
  reportLocalProgress,
  useProgressStore,
} from "../../stores/progressStore";
import { paginateItems } from "../../utils/pagination";
import { useI18n } from "../../i18n/I18nProvider";
import { RecruitAgentDetailPanel } from "./RecruitAgentDetailPanel";

/** Single practical hire surface (no overview / team / relationship fluff). */
export const RECRUITMENT_SECTIONS = [
  { id: "hire", label: "Find & hire" },
] as const;

const CANDIDATE_PAGE_SIZE = 6;

function monthlySalaryForCandidate(candidate: RecruitmentCandidate): number {
  return monthlySalaryFromHourly(candidate.hourly_rate_usdt);
}

interface HireDraft {
  candidate: RecruitmentCandidate;
  role: string;
  department: string;
  soulMdContent: string;
  systemPromptSource: string | null;
  offeredSalary: number;
  soulEdited: boolean;
  activeTemplateId: string | null;
}

interface KeywordSuggestResult {
  keywords: string[];
  focus_project_ids: string[];
  rationale: string;
  source: string;
}

interface RecruitmentPanelProps {
  /** Kept for page chrome compatibility; only "hire" is used. */
  activeSection?: string;
  onNavigateSection?: (sectionId: string) => void;
}

export function RecruitmentPanel(_props: RecruitmentPanelProps) {
  const { t } = useI18n();
  const settings = useGameStore((state) => state.settings);
  const hubStatus = useGameStore((state) => state.hubStatus);
  const finance = useGameStore((state) => state.finance);
  const setStatusMessage = useGameStore((state) => state.setStatusMessage);
  const setAgentRecords = useGameStore((state) => state.setAgentRecords);
  const setFinance = useGameStore((state) => state.setFinance);
  const activeCompanyId = useGameStore((state) => state.activeCompanyId);
  const { departmentNames } = useCompanyDepartments();

  const [projects, setProjects] = useState<InternalProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordRationale, setKeywordRationale] = useState<string | null>(null);
  const [keywordSource, setKeywordSource] = useState<string | null>(null);
  const [suggestingKeywords, setSuggestingKeywords] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [candidatesFromCache, setCandidatesFromCache] = useState(false);
  const [candidatesCacheMessage, setCandidatesCacheMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [candidatePage, setCandidatePage] = useState(0);

  const [hireDraft, setHireDraft] = useState<HireDraft | null>(null);
  const [soulLoading, setSoulLoading] = useState(false);
  const [hiring, setHiring] = useState(false);
  /** Inline hire desk error — status bar alone is easy to miss. */
  const [hireError, setHireError] = useState<string | null>(null);
  const soulLoadGenerationRef = useRef(0);

  const defaultDepartment = departmentNames[0] ?? "Engineering";

  useEffect(() => {
    let cancelled = false;
    void listProjects()
      .then((list) => {
        if (!cancelled) {
          setProjects(list);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatusMessage(String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, setStatusMessage]);

  const activeSearchQuery = useMemo(() => {
    const fromBox = searchQuery.trim();
    if (fromBox) {
      return fromBox;
    }
    return keywords.join(" ").trim();
  }, [keywords, searchQuery]);

  const runSearch = useCallback(
    async (queryOverride?: string) => {
      const query = (queryOverride ?? activeSearchQuery).trim() || null;
      setLoading(true);
      setHasSearched(true);
      try {
        const result = await invoke<{
          candidates: RecruitmentCandidate[];
          from_cache: boolean;
          message?: string | null;
        }>("list_recruitment_candidates", {
          query,
        });
        setCandidates(result.candidates);
        setCandidatesFromCache(result.from_cache);
        setCandidatesCacheMessage(result.message ?? null);
        setCandidatePage(0);
        setStatusMessage(
          result.candidates.length > 0
            ? t("recruitment.msg.found", {
                n: result.candidates.length,
                query: query ? t("recruitment.msg.foundQuery", { query }) : "",
              })
            : query
              ? t("recruitment.msg.noMatchQuery", { query })
              : t("recruitment.msg.noCandidates"),
        );
      } catch (error) {
        setStatusMessage(String(error));
      } finally {
        setLoading(false);
      }
    },
    [activeSearchQuery, setStatusMessage, t],
  );

  const suggestKeywords = useCallback(async () => {
    if (suggestingKeywords) {
      return;
    }
    const opId = "recruitment_keywords";
    setSuggestingKeywords(true);
    setStatusMessage(t("recruitment.msg.generatingKeywords"));
    reportLocalProgress(opId, t("recruitment.msg.suggestingProgress"), -1, "llm");
    useProgressStore.getState().setLlmLiveOpen(true);
    try {
      const result = await invoke<KeywordSuggestResult>(
        "suggest_recruitment_keywords_from_projects",
        {
          request: {
            project_id: selectedProjectId.trim() || null,
          },
        },
      );
      setKeywords(result.keywords);
      setKeywordRationale(result.rationale);
      setKeywordSource(result.source);
      const joined = result.keywords.join(" ");
      setSearchQuery(joined);
      setStatusMessage(
        result.keywords.length > 0
          ? t("recruitment.msg.keywordsReady", {
              source: result.source,
              list: result.keywords.join(", "),
            })
          : t("recruitment.msg.noKeywords"),
      );
      finishProgress(
        opId,
        result.keywords.length > 0
          ? t("recruitment.msg.keywordsReady", {
              source: result.source,
              list: result.keywords.join(", "),
            })
          : t("recruitment.msg.noKeywordsShort"),
        "done",
      );
      if (result.keywords.length > 0) {
        await runSearch(joined);
      }
    } catch (error) {
      setStatusMessage(String(error));
      finishProgress(opId, String(error), "error");
    } finally {
      setSuggestingKeywords(false);
    }
  }, [runSearch, selectedProjectId, setStatusMessage, suggestingKeywords]);

  const addKeywordFromInput = useCallback(() => {
    const raw = keywordInput.trim().toLowerCase();
    if (!raw) {
      return;
    }
    const parts = raw.split(/[\s,;]+/).filter((p) => p.length >= 2);
    if (parts.length === 0) {
      return;
    }
    setKeywords((current) => {
      const seen = new Set(current);
      const next = [...current];
      for (const part of parts) {
        if (!seen.has(part)) {
          seen.add(part);
          next.push(part);
        }
      }
      return next.slice(0, 16);
    });
    setKeywordInput("");
  }, [keywordInput]);

  const removeKeyword = useCallback((kw: string) => {
    setKeywords((current) => current.filter((k) => k !== kw));
  }, []);

  const applyKeywordSearch = useCallback(() => {
    const joined = keywords.join(" ");
    setSearchQuery(joined);
    void runSearch(joined);
  }, [keywords, runSearch]);

  const soulTemplates = useMemo(() => {
    if (!hireDraft) {
      return [] as SoulTemplateOption[];
    }
    return soulTemplatesForDepartment(hireDraft.department, {
      role: hireDraft.role,
      name: hireDraft.candidate.name,
    });
  }, [hireDraft]);

  const {
    pageItems: pageCandidates,
    totalPages: candidateTotalPages,
    safePage: safeCandidatePage,
  } = useMemo(
    () => paginateItems(candidates, candidatePage, CANDIDATE_PAGE_SIZE),
    [candidates, candidatePage],
  );

  useEffect(() => {
    if (candidatePage !== safeCandidatePage) {
      setCandidatePage(safeCandidatePage);
    }
  }, [candidatePage, safeCandidatePage]);

  const selectCandidateForHire = useCallback(
    async (candidate: RecruitmentCandidate) => {
      const department =
        candidate.department_fit &&
        (departmentNames.length === 0 || departmentNames.includes(candidate.department_fit))
          ? candidate.department_fit
          : defaultDepartment;
      const role = candidate.job_role || candidate.vibe || t("recruitment.specialist");
      const draftSoul = buildSoulDraftFromCandidate(candidate);

      setHireError(null);
      setHireDraft({
        candidate,
        role,
        department,
        soulMdContent: draftSoul,
        systemPromptSource: null,
        offeredSalary: monthlySalaryForCandidate(candidate),
        soulEdited: false,
        activeTemplateId: isHubCandidate(candidate) ? "hub-soul" : "blank-dept",
      });
      setSoulLoading(true);

      const generation = ++soulLoadGenerationRef.current;
      try {
        const resolved = await resolveCandidateSoul(candidate);
        if (generation !== soulLoadGenerationRef.current) {
          return;
        }
        setHireDraft((current) => {
          if (!current || current.candidate.id !== candidate.id || current.soulEdited) {
            return current;
          }
          return {
            ...current,
            soulMdContent: resolved.displayMd,
            systemPromptSource: resolved.systemPromptSource,
            activeTemplateId: isHubCandidate(candidate) ? "hub-soul" : current.activeTemplateId,
          };
        });
      } finally {
        if (generation === soulLoadGenerationRef.current) {
          setSoulLoading(false);
        }
      }
    },
    [defaultDepartment, departmentNames],
  );

  const startCustomHire = useCallback(() => {
    const custom = buildCustomHireCandidate({
      name: "New Hire",
      role: t("recruitment.specialist"),
      department: defaultDepartment,
    });
    const preferred = preferredSoulTemplateForDepartment(defaultDepartment, {
      role: custom.job_role,
      name: custom.name,
    });
    setHireDraft({
      candidate: { ...custom, soul_md_content: preferred.content },
      role: custom.job_role,
      department: defaultDepartment,
      soulMdContent: preferred.content,
      systemPromptSource: null,
      offeredSalary: monthlySalaryForCandidate(custom),
      soulEdited: false,
      activeTemplateId: preferred.id,
    });
    setSoulLoading(false);
    setStatusMessage(t("recruitment.msg.customDraft"));
  }, [defaultDepartment, setStatusMessage]);

  const applySoulTemplate = useCallback(
    (template: SoulTemplateOption) => {
      void (async () => {
        const current = hireDraft;
        if (!current) {
          return;
        }
        if (current.soulEdited && current.soulMdContent.trim() !== template.content.trim()) {
          const { confirmDialog } = await import("../../utils/nativeDialog");
          const ok = await confirmDialog(t("recruitment.replaceSoul"), {
            title: t("recruitment.soulTemplate"),
            kind: "warning",
          });
          if (!ok) {
            return;
          }
        }
        setHireDraft((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            soulMdContent: template.content,
            systemPromptSource: null,
            soulEdited: false,
            activeTemplateId: template.id,
          };
        });
      })();
    },
    [hireDraft],
  );

  const restoreHubSoul = useCallback(async () => {
    if (!hireDraft || !isHubCandidate(hireDraft.candidate)) {
      return;
    }
    setSoulLoading(true);
    const generation = ++soulLoadGenerationRef.current;
    try {
      const resolved = await resolveCandidateSoul(hireDraft.candidate);
      if (generation !== soulLoadGenerationRef.current) {
        return;
      }
      setHireDraft((current) => {
        if (!current || current.candidate.id !== hireDraft.candidate.id) {
          return current;
        }
        return {
          ...current,
          soulMdContent: resolved.displayMd,
          systemPromptSource: resolved.systemPromptSource,
          soulEdited: false,
          activeTemplateId: "hub-soul",
        };
      });
    } finally {
      if (generation === soulLoadGenerationRef.current) {
        setSoulLoading(false);
      }
    }
  }, [hireDraft]);

  const updateDisplayName = useCallback((name: string) => {
    setHireDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        candidate: { ...current.candidate, name },
      };
    });
  }, []);

  const confirmHire = async () => {
    setHireError(null);
    if (!hireDraft) {
      const msg = t("recruitment.msg.selectFirst");
      setHireError(msg);
      setStatusMessage(msg);
      return;
    }
    const { candidate, role, department, soulMdContent, systemPromptSource, offeredSalary } =
      hireDraft;
    if (!candidate.name.trim()) {
      const msg = t("recruitment.msg.needName");
      setHireError(msg);
      setStatusMessage(msg);
      return;
    }
    if (!role.trim()) {
      const msg = t("recruitment.msg.needRole");
      setHireError(msg);
      setStatusMessage(msg);
      return;
    }
    if (!department.trim()) {
      const msg = t("recruitment.msg.needDept");
      setHireError(msg);
      setStatusMessage(msg);
      return;
    }
    if (!soulMdContent.trim()) {
      const msg = t("recruitment.msg.needSoul");
      setHireError(msg);
      setStatusMessage(msg);
      return;
    }

    const salary = clampRecruitSalary(offeredSalary);
    if (salary !== offeredSalary) {
      setHireDraft((current) => (current ? { ...current, offeredSalary: salary } : current));
    }
    const onboardingTokens = Math.round(salary * 0.5);
    const companyTokens = totalCompanyTokens(finance);
    if (onboardingTokens > 0 && companyTokens < onboardingTokens) {
      const msg = t("recruitment.msg.notEnoughTokensDetail", {
        need: onboardingTokens.toLocaleString(),
        have: companyTokens.toLocaleString(),
      });
      setHireError(msg);
      setStatusMessage(msg);
      return;
    }

    setHiring(true);
    try {
      const hired = await invoke<AgentRecord>("hire_candidate", {
        request: {
          candidate_id: candidate.id,
          role: role.trim(),
          department: department.trim(),
          offered_salary: salary,
          soul_md_content: soulMdContent,
          system_prompt_source: systemPromptSource,
          display_name: candidate.name.trim() || null,
        },
      });
      const agents = await invoke<AgentRecord[]>("list_agents");
      setAgentRecords(agents);
      const updatedFinance = await invoke<TokenEconomy>("get_finance_state");
      setFinance(updatedFinance);
      const { syncWorkspaceFoldersAfterOrgChange } = await import("../../services/workspaceClient");
      await syncWorkspaceFoldersAfterOrgChange().catch(() => undefined);
      setHireDraft(null);
      setHireError(null);
      setStatusMessage(t("recruitment.msg.hired", { name: hired.name, department: hired.department, role: hired.role }));
    } catch (error) {
      const msg = String(error);
      setHireError(msg);
      setStatusMessage(msg);
    } finally {
      setHiring(false);
    }
  };

  const hubConnectionLabel = settings.pure_local_mode
    ? t("recruitment.hub.pureLocal")
    : hubStatus.connected
      ? t("recruitment.hub.connected")
      : t("recruitment.hub.offline");

  const poolStatusLabel = loading
    ? t("recruitment.pool.searching")
    : candidatesFromCache && candidatesCacheMessage
      ? candidatesCacheMessage
      : hasSearched
        ? candidates.length > 0
          ? candidatesFromCache
            ? t("recruitment.pool.countCached", { n: candidates.length })
            : t("recruitment.pool.countHub", { n: candidates.length })
          : t("recruitment.pool.noMatches")
        : settings.pure_local_mode
          ? t("recruitment.pool.pureLocalHint")
          : t("recruitment.pool.hubHint");

  return (
    <div className="recruitment-panel recruitment-panel--page">
      <section
        id="hire"
        className="recruitment-card recruitment-card--wide"
        data-recruitment-section="hire"
      >
        <header className="recruitment-card-header recruitment-card-header--stacked">
          <h3>{t("recruitment.findHireTitle")}</h3>
          <p className="muted">{t("recruitment.findHireDesc")}</p>
        </header>

        <div className="hub-status-row">
          <span
            className={`hub-pill ${hubStatus.connected && !settings.pure_local_mode ? "online" : "offline"}`}
          >
            {hubConnectionLabel}
          </span>
          {loading ? <span className="hub-pill offline">{t("recruitment.searchingShort")}</span> : null}
          <span className="hub-pill muted">{poolStatusLabel}</span>
        </div>

        {settings.pure_local_mode ? (
          <p className="hub-warning">{t("recruitment.pureLocalWarn")}</p>
        ) : null}

        <div className="recruitment-keyword-studio">
          <div className="recruitment-toolbar recruitment-keyword-toolbar">
            <label className="field-label recruitment-filter">
              {t("recruitment.projectFocus")}
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="">{t("recruitment.allProjects")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                    {project.owner_department ? ` · ${project.owner_department}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="primary-action"
              disabled={suggestingKeywords}
              onClick={() => void suggestKeywords()}
            >
              {suggestingKeywords ? t("recruitment.llmKeywords.busy") : t("recruitment.llmKeywords")}
            </button>
            <button type="button" className="secondary-action" onClick={startCustomHire}>
              {t("recruitment.customHire")}
            </button>
          </div>

          {keywordRationale ? (
            <p className="muted recruitment-keyword-rationale" role="status">
              {keywordSource ? `[${keywordSource}] ` : null}
              {keywordRationale}
            </p>
          ) : null}

          <div className="recruitment-keyword-chips" aria-label={t("recruitment.keywordsAria")}>
            {keywords.length === 0 ? (
              <span className="muted">{t("recruitment.noKeywordsYet")}</span>
            ) : (
              keywords.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  className="recruitment-quick-tag active"
                  title={t("recruitment.removeKeyword")}
                  onClick={() => removeKeyword(kw)}
                >
                  {kw} ×
                </button>
              ))
            )}
          </div>

          <div className="recruitment-toolbar">
            <label className="field-label recruitment-filter">
              {t("recruitment.addKeywordLabel")}
              <input
                type="text"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addKeywordFromInput();
                  }
                }}
                placeholder={t("recruitment.keywordChipPh")}
              />
            </label>
            <button type="button" className="secondary-action" onClick={addKeywordFromInput}>{t("recruit.addKeyword")}</button>
            <button
              type="button"
              className="secondary-action"
              disabled={keywords.length === 0}
              onClick={applyKeywordSearch}
            >
              {t("recruit.searchWithKeywords")}
            </button>
          </div>

          <div className="recruitment-toolbar">
            <label className="field-label recruitment-filter">
              Hub search query
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
                placeholder={t("recruitment.hubQueryPh")}
              />
            </label>
            <button
              type="button"
              className="primary-action"
              disabled={loading}
              onClick={() => void runSearch()}
            >
              {loading ? t("recruitment.searching") : t("recruitment.searchSoul")}
            </button>
          </div>
        </div>

        <p className="muted recruitment-pool-status" role="status">
          {poolStatusLabel}
        </p>

        <div className="recruitment-hire-desk">
          <div className="recruitment-hire-desk-pool">
            {!hasSearched && candidates.length === 0 ? (
              <p className="muted">{t("recruitment.startHint")}</p>
            ) : candidates.length === 0 ? (
              <p className="muted">
                {loading
                  ? t("recruitment.loadingCandidates")
                  : t("recruitment.noMatchCandidates")}
              </p>
            ) : (
              <>
                <div className="recruitment-pool-meta">
                  <span>
                    {t("recruitment.showing", {
                      from: safeCandidatePage * CANDIDATE_PAGE_SIZE + 1,
                      to: Math.min(
                        (safeCandidatePage + 1) * CANDIDATE_PAGE_SIZE,
                        candidates.length,
                      ),
                      total: candidates.length,
                    })}
                  </span>
                </div>
                <div className="recruitment-candidate-list" role="list">
                  {pageCandidates.map((candidate) => {
                    const onHireDesk = hireDraft?.candidate.id === candidate.id;
                    const roleLabel = candidate.job_role || candidate.vibe || t("recruitment.specialist");
                    const description =
                      candidate.headline?.trim() ||
                      t("recruitment.noHubDesc");
                    return (
                      <article
                        key={candidate.id}
                        role="listitem"
                        className={`recruitment-candidate-row ${onHireDesk ? "selected" : ""}`}
                      >
                        <div className="recruitment-candidate-row-main">
                          <h4 className="recruitment-candidate-name" title={candidate.name}>
                            {candidate.name}
                          </h4>
                          <p className="recruitment-candidate-role muted">{roleLabel}</p>
                          <p className="recruitment-candidate-description" title={description}>
                            {description}
                          </p>
                          {candidate.skills.length > 0 ? (
                            <div className="skill-tags recruitment-candidate-skills">
                              {candidate.skills.slice(0, 4).map((skill) => (
                                <span key={skill}>{skill}</span>
                              ))}
                            </div>
                          ) : null}
                          <div className="recruitment-candidate-meta muted">
                            <span>{candidate.department_fit ?? t("recruitment.flexibleDept")}</span>
                            <span aria-hidden="true">·</span>
                            <span>{candidate.verified ? t("recruitment.verified") : t("recruitment.unverified")}</span>
                          </div>
                        </div>
                        <div className="recruitment-candidate-row-actions">
                          <button
                            type="button"
                            className={onHireDesk ? "primary-action" : "secondary-action"}
                            onClick={() => void selectCandidateForHire(candidate)}
                          >
                            {onHireDesk ? t("common.selected") : t("recruitment.review")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {candidateTotalPages > 1 ? (
                  <div
                    className="pagination-bar recruitment-candidate-pagination"
                    role="navigation"
                    aria-label={t("recruitment.candidatePagesAria")}
                  >
                    <button
                      type="button"
                      disabled={safeCandidatePage <= 0}
                      onClick={() => setCandidatePage((p) => Math.max(0, p - 1))}
                    >
                      {t("common.previous")}
                    </button>
                    <span className="pagination-bar-status muted">
                      {t("recruitment.pageOf", {
                        page: safeCandidatePage + 1,
                        total: candidateTotalPages,
                      })}
                    </span>
                    <button
                      type="button"
                      disabled={safeCandidatePage >= candidateTotalPages - 1}
                      onClick={() =>
                        setCandidatePage((p) => Math.min(candidateTotalPages - 1, p + 1))
                      }
                    >
                      {t("common.next")}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="recruitment-hire-desk-detail">
            {hireDraft ? (
              <>
                <div className="recruitment-soul-templates">
                  <span className="recruitment-soul-templates-label muted">{t("recruitment.soulSource")}</span>
                  <div className="skill-tags recruitment-soul-template-chips">
                    {isHubCandidate(hireDraft.candidate) ? (
                      <button
                        type="button"
                        className={`recruitment-quick-tag ${hireDraft.activeTemplateId === "hub-soul" ? "active" : ""}`}
                        onClick={() => void restoreHubSoul()}
                        disabled={soulLoading}
                      >
                        {t("recruitment.hubSoul")}
                      </button>
                    ) : null}
                    {soulTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`recruitment-quick-tag ${hireDraft.activeTemplateId === template.id ? "active" : ""}`}
                        title={template.description}
                        onClick={() => applySoulTemplate(template)}
                      >
                        {template.label}
                        {template.departmentMatch >= 2 ? t("recruitment.deptMatch") : ""}
                      </button>
                    ))}
                  </div>
                  <p className="muted recruitment-soul-template-hint">
                    {t("recruitment.hireDeskHint")}
                  </p>
                </div>

                <label className="field-label">
                  {t("recruitment.displayNameLabel")}
                  <input
                    type="text"
                    value={hireDraft.candidate.name}
                    maxLength={64}
                    onChange={(event) => updateDisplayName(event.target.value)}
                    placeholder={t("recruitment.namePh")}
                  />
                </label>

                <label className="field-label">
                  {t("recruitment.offeredSalary")}
                  <input
                    type="number"
                    min={RECRUIT_SALARY_MIN}
                    max={RECRUIT_SALARY_MAX}
                    step={100}
                    value={hireDraft.offeredSalary}
                    onChange={(event) => {
                      const offeredSalary = clampRecruitSalary(Number(event.target.value) || 0);
                      setHireError(null);
                      setHireDraft((current) =>
                        current ? { ...current, offeredSalary } : current,
                      );
                    }}
                  />
                </label>
                <p className="muted">
                  {t("recruitment.onboardingCharge", {
                    n: Math.round(
                      clampRecruitSalary(hireDraft.offeredSalary) * 0.5,
                    ).toLocaleString(),
                  })}
                  {" · "}
                  {t("recruitment.companyTokensHave", {
                    n: totalCompanyTokens(finance).toLocaleString(),
                  })}
                  {isCustomHireCandidate(hireDraft.candidate)
                    ? t("recruitment.customHireTag")
                    : t("recruitment.hubSoulTag")}
                </p>

                <RecruitAgentDetailPanel
                  candidate={hireDraft.candidate}
                  soulLoading={soulLoading}
                  role={hireDraft.role}
                  department={
                    departmentNames.includes(hireDraft.department) || departmentNames.length === 0
                      ? hireDraft.department
                      : defaultDepartment
                  }
                  soulMdContent={hireDraft.soulMdContent}
                  displayName={hireDraft.candidate.name}
                  onDisplayNameChange={updateDisplayName}
                  showNameField={false}
                  onRoleChange={(role) =>
                    setHireDraft((current) => (current ? { ...current, role } : current))
                  }
                  onDepartmentChange={(department) => {
                    setHireDraft((current) => {
                      if (!current) {
                        return current;
                      }
                      const next = { ...current, department };
                      if (!current.soulEdited) {
                        const preferred = preferredSoulTemplateForDepartment(department, {
                          role: current.role,
                          name: current.candidate.name,
                        });
                        next.soulMdContent = preferred.content;
                        next.systemPromptSource = null;
                        next.activeTemplateId = preferred.id;
                      }
                      return next;
                    });
                  }}
                  onSoulChange={(content) =>
                    setHireDraft((current) =>
                      current
                        ? {
                            ...current,
                            soulMdContent: content,
                            soulEdited: true,
                            systemPromptSource: null,
                            activeTemplateId: null,
                          }
                        : current,
                    )
                  }
                />

                {hireError ? (
                  <p className="recruitment-hire-error" role="alert">
                    {hireError}
                  </p>
                ) : null}
                <div className="recruitment-card-actions recruitment-hire-confirm">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => {
                      setHireDraft(null);
                      setHireError(null);
                    }}
                    disabled={hiring}
                  >
                    {t("recruitment.clear")}
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={hiring || soulLoading}
                    onClick={() => void confirmHire()}
                  >
                    {hiring
                      ? t("recruitment.hiring")
                      : t("recruitment.confirmHire", {
                          name: hireDraft.candidate.name.trim() || "agent",
                          department: hireDraft.department,
                        })}
                  </button>
                </div>
              </>
            ) : (
              <div className="recruit-agent-detail recruit-agent-detail-empty">
                <p className="muted">{t("recruitment.emptyDesk")}</p>
                <button type="button" className="primary-action" onClick={startCustomHire}>
                  {t("recruitment.startCustom")}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
