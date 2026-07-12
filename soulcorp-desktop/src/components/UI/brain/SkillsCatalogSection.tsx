import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "../../../utils/tauriInvoke";
import { useI18n } from "../../../i18n/I18nProvider";
import { useGameStore } from "../../../stores/gameStore";
import { confirmDialog } from "../../../utils/nativeDialog";
import { PaginationBar } from "../PaginationBar";

export interface SkillSummary {
  id: string;
  name: string;
  category: string;
  risk: "low" | "medium" | "high" | "critical";
  requires_approval: boolean;
  token_cost_class: "light" | "medium" | "heavy";
  when_to_use: string;
  tool_ids: string[];
  enabled: boolean;
  source: "builtin" | "company" | "global";
  entry?: string | null;
  runtime?: string | null;
}

export interface SkillCatalogView {
  version: number;
  packs: SkillSummary[];
  by_category: Record<string, string[]>;
}

export interface SkillPreferences {
  disabled_packs: string[];
  force_enabled_packs: string[];
  allow_high_risk: boolean;
  allow_critical: boolean;
  domain_allowlist: string[];
  firewall_enabled?: boolean;
  allow_network?: boolean;
  allow_browser?: boolean;
  allow_scripts?: boolean;
  allow_media_generate?: boolean;
  allow_social_post?: boolean;
  dry_run_high?: boolean;
  dry_run_critical?: boolean;
  domain_mode?: string;
  domain_blocklist?: string[];
  allowed_script_runtimes?: string[];
  blocked_tools?: string[];
  blocked_permissions?: string[];
  require_domain_for_fetch?: boolean;
}

export interface FirewallEvent {
  at: string;
  tool: string;
  pack_id: string | null;
  allow: boolean;
  dry_run: boolean;
  layer: string | null;
  reason: string;
}

export interface FirewallStatus {
  prefs: SkillPreferences;
  status_label: string;
  packs_total: number;
  packs_runnable: number;
  packs_blocked_risk: number;
  recent_blocks: number;
}

export interface ToolParameterSpec {
  name: string;
  kind: string;
}

export interface ToolSpec {
  id: string;
  description: string;
  parameters: ToolParameterSpec[];
}

export interface SkillPack {
  id: string;
  name: string;
  version: number;
  category: string;
  risk: SkillSummary["risk"];
  requires_approval: boolean;
  token_cost_class: SkillSummary["token_cost_class"];
  permissions: string[];
  tools: ToolSpec[];
  when_to_use: string;
  body: string;
  source: SkillSummary["source"];
  entry?: string | null;
  runtime?: string | null;
}

export interface RuntimeStatus {
  id: string;
  label: string;
  available: boolean;
  path: string | null;
  version: string | null;
  source: string;
  extensions: string[];
  installable: boolean;
  install_hint: string | null;
}

export interface CustomSkillSummary {
  id: string;
  name: string;
  scope: "company" | "global";
  runtime: string | null;
  entry: string | null;
  path: string;
  risk: string;
}

export interface ScriptRunResult {
  ok: boolean;
  runtime: string;
  runtime_path: string | null;
  entry: string;
  argv: string[];
  cwd: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  parsed_json: unknown;
  error: string | null;
}

type StatusFilter = "all" | "enabled" | "disabled";
type ModalTab = "overview" | "tools" | "source";
type MainTab = "catalog" | "lab" | "runtimes";
type LabScope = "company" | "global";

const PAGE_SIZE = 6;

const RISK_ORDER: Record<SkillSummary["risk"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const RISK_KEY: Record<SkillSummary["risk"], string> = {
  low: "skills.risk.low",
  medium: "skills.risk.medium",
  high: "skills.risk.high",
  critical: "skills.risk.critical",
};

const COST_KEY: Record<SkillSummary["token_cost_class"], string> = {
  light: "skills.cost.light",
  medium: "skills.cost.medium",
  heavy: "skills.cost.heavy",
};

const CATEGORY_GLYPH: Record<string, string> = {
  research: "🔍",
  engineering: "⚙️",
  media: "🎨",
  growth: "🚀",
  ops: "📋",
  general: "✨",
};

const CATEGORY_KEY: Record<string, string> = {
  research: "skills.cat.research",
  engineering: "skills.cat.engineering",
  media: "skills.cat.media",
  growth: "skills.cat.growth",
  ops: "skills.cat.ops",
  general: "skills.cat.general",
};

type TranslateFn = (key: string, params?: Record<string, string | number | undefined | null>) => string;

function categoryMeta(category: string, t: TranslateFn) {
  const key = category.toLowerCase();
  const labelKey = CATEGORY_KEY[key];
  return {
    label: labelKey ? t(labelKey) : category.charAt(0).toUpperCase() + category.slice(1),
    glyph: CATEGORY_GLYPH[key] ?? "◆",
  };
}

function toolSchemaCode(tool: ToolSpec): string {
  const params =
    tool.parameters.length === 0
      ? "  // no parameters"
      : tool.parameters.map((p) => `  ${p.name}: ${p.kind}`).join("\n");
  return [
    `// Tool: ${tool.id}`,
    `// ${tool.description}`,
    `{`,
    `  tool: "${tool.id}",`,
    `  args: {`,
    params,
    `  }`,
    `}`,
  ].join("\n");
}

function SkillToggle({
  checked,
  disabled,
  busy,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      className={`skills-toggle${checked ? " is-on" : ""}${busy ? " is-busy" : ""}`}
      onClick={onChange}
    >
      <span className="skills-toggle-thumb" />
    </button>
  );
}

interface SkillDetailModalProps {
  packId: string;
  focusToolId?: string | null;
  enabled: boolean;
  onClose: () => void;
  onToggle: () => void;
  busy?: boolean;
}

function SkillDetailModal({
  packId,
  focusToolId,
  enabled,
  onClose,
  onToggle,
  busy,
}: SkillDetailModalProps) {
  const { t } = useI18n();
  const [pack, setPack] = useState<SkillPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ModalTab>(focusToolId ? "tools" : "overview");
  const [selectedToolId, setSelectedToolId] = useState<string | null>(focusToolId ?? null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void invoke<SkillPack>("get_skill_pack", { skillId: packId })
      .then((next) => {
        if (cancelled) return;
        setPack(next);
        const tool =
          focusToolId && next.tools.some((t) => t.id === focusToolId)
            ? focusToolId
            : (next.tools[0]?.id ?? null);
        setSelectedToolId(tool);
        if (focusToolId) setTab("tools");
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packId, focusToolId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedTool = pack?.tools.find((tool) => tool.id === selectedToolId) ?? null;
  const meta = pack ? categoryMeta(pack.category, t) : null;

  return (
    <div
      className="skills-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="skills-modal" role="dialog" aria-modal="true" aria-labelledby="skills-modal-title">
        <header className="skills-modal-header">
          <div className="skills-modal-header-text">
            <p className="skills-modal-eyebrow">{t("skills.skillPack")}</p>
            <h3 id="skills-modal-title">{pack?.name ?? packId}</h3>
            {pack ? (
              <div className="skills-modal-badges">
                <span className={`skills-risk skills-risk--${pack.risk}`}>{t(RISK_KEY[pack.risk])}</span>
                <span className="skills-badge">{meta?.label}</span>
                <span className="skills-badge">{pack.source}</span>
                <span className={`skills-badge${enabled ? " skills-badge--on" : ""}`}>
                  {enabled ? t("skills.enabled") : t("skills.disabled")}
                </span>
              </div>
            ) : null}
          </div>
          <div className="skills-modal-header-actions">
            <SkillToggle
              checked={enabled}
              busy={busy}
              onChange={onToggle}
              label={
                enabled
                  ? t("skills.disablePack", { name: pack?.name ?? packId })
                  : t("skills.enablePack", { name: pack?.name ?? packId })
              }
            />
            <button type="button" className="skills-btn skills-btn--ghost" onClick={onClose}>
              {t("skills.close")}
            </button>
          </div>
        </header>

        <div className="skills-modal-tabs" role="tablist">
          {(
            [
              ["overview", t("skills.tab.overview")],
              ["tools", pack ? t("skills.tab.toolsCount", { n: pack.tools.length }) : t("skills.tab.tools")],
              ["source", t("skills.tab.source")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`skills-modal-tab${tab === id ? " is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="skills-modal-body">
          {loading ? <p className="muted">{t("skills.loadingPack")}</p> : null}
          {error ? (
            <p className="hub-warning" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && pack && tab === "overview" ? (
            <div className="skills-modal-overview">
              <section>
                <h4>{t("skills.whenToUse")}</h4>
                <p>{pack.when_to_use}</p>
              </section>
              <section>
                <h4>{t("skills.identity")}</h4>
                <dl className="skills-meta-grid">
                  <div>
                    <dt>{t("skills.meta.id")}</dt>
                    <dd>
                      <code>{pack.id}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("skills.meta.source")}</dt>
                    <dd>{pack.source}</dd>
                  </div>
                  {pack.entry ? (
                    <div>
                      <dt>{t("skills.meta.entry")}</dt>
                      <dd>
                        <code>{pack.entry}</code>
                      </dd>
                    </div>
                  ) : null}
                  {pack.runtime ? (
                    <div>
                      <dt>{t("skills.meta.runtime")}</dt>
                      <dd>{pack.runtime}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
              <section>
                <h4>{t("skills.tools")}</h4>
                <div className="skills-tool-btns">
                  {pack.tools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      className="skills-tool-btn"
                      onClick={() => {
                        setSelectedToolId(tool.id);
                        setTab("tools");
                      }}
                    >
                      <code>{tool.id}</code>
                      <span>{t("skills.view")}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {!loading && pack && tab === "tools" ? (
            <div className="skills-modal-tools">
              <div className="skills-tool-list">
                {pack.tools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className={`skills-tool-list-item${selectedToolId === tool.id ? " is-active" : ""}`}
                    onClick={() => setSelectedToolId(tool.id)}
                  >
                    <code>{tool.id}</code>
                    <span className="muted">{t("skills.paramsCount", { n: tool.parameters.length })}</span>
                  </button>
                ))}
              </div>
              <div className="skills-tool-panel">
                {selectedTool ? (
                  <>
                    <header className="skills-tool-panel-head">
                      <h4>
                        <code>{selectedTool.id}</code>
                      </h4>
                      <p className="muted">{selectedTool.description}</p>
                    </header>
                    <div className="skills-tool-params">
                      <h5>{t("skills.parameters")}</h5>
                      {selectedTool.parameters.length === 0 ? (
                        <p className="muted">{t("skills.noParameters")}</p>
                      ) : (
                        <table className="skills-param-table">
                          <thead>
                            <tr>
                              <th>{t("skills.paramName")}</th>
                              <th>{t("skills.paramType")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedTool.parameters.map((p) => (
                              <tr key={p.name}>
                                <td>
                                  <code>{p.name}</code>
                                </td>
                                <td>
                                  <code>{p.kind}</code>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="skills-code-block-wrap">
                      <div className="skills-code-block-bar">
                        <span>{t("skills.callShape")}</span>
                        <button
                          type="button"
                          className="skills-btn skills-btn--ghost skills-btn--xs"
                          onClick={() => void navigator.clipboard?.writeText(toolSchemaCode(selectedTool))}
                        >
                          {t("skills.copy")}
                        </button>
                      </div>
                      <pre className="skills-code-block">
                        <code>{toolSchemaCode(selectedTool)}</code>
                      </pre>
                    </div>
                  </>
                ) : (
                  <p className="muted">{t("skills.selectTool")}</p>
                )}
              </div>
            </div>
          ) : null}

          {!loading && pack && tab === "source" ? (
            <div className="skills-code-block-wrap skills-source-block">
              <div className="skills-code-block-bar">
                <span>{t("skills.skillMdBody")}</span>
                <button
                  type="button"
                  className="skills-btn skills-btn--ghost skills-btn--xs"
                  onClick={() => void navigator.clipboard?.writeText(pack.body || "")}
                >
                  {t("skills.copy")}
                </button>
              </div>
              <pre className="skills-code-block skills-code-block--tall">
                <code>{pack.body?.trim() || t("skills.emptyBody")}</code>
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SkillsCatalogSection() {
  const { t } = useI18n();
  const setStatusMessage = useGameStore((s) => s.setStatusMessage);
  const [mainTab, setMainTab] = useState<MainTab>("catalog");
  const [catalog, setCatalog] = useState<SkillCatalogView | null>(null);
  const [prefs, setPrefs] = useState<SkillPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [domainDraft, setDomainDraft] = useState("");
  const [blocklistDraft, setBlocklistDraft] = useState("");
  const [blockedToolsDraft, setBlockedToolsDraft] = useState("");
  const [safetyOpen, setSafetyOpen] = useState(true);
  const [fwAdvanced, setFwAdvanced] = useState(false);
  const [firewallStatus, setFirewallStatus] = useState<FirewallStatus | null>(null);
  const [firewallAudit, setFirewallAudit] = useState<FirewallEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ packId: string; toolId?: string | null } | null>(null);

  // Runtimes
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [runtimeBusy, setRuntimeBusy] = useState<string | null>(null);
  const [runtimeLog, setRuntimeLog] = useState<string | null>(null);

  // Lab
  const [labScope, setLabScope] = useState<LabScope>("global");
  const [customSkills, setCustomSkills] = useState<CustomSkillSummary[]>([]);
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<LabScope>("global");
  const [editMode, setEditMode] = useState(false);
  const [editorTab, setEditorTab] = useState<"script" | "manifest" | "meta">("script");
  const [skillMd, setSkillMd] = useState("");
  const [entryName, setEntryName] = useState("");
  const [entryContent, setEntryContent] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [baseline, setBaseline] = useState<{
    skillMd: string;
    entryName: string;
    entryContent: string;
    displayName: string;
  } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [labFilter, setLabFilter] = useState<string>("all");
  const [testCommand, setTestCommand] = useState("");
  const [testResult, setTestResult] = useState<ScriptRunResult | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRuntime, setNewRuntime] = useState("php");

  const loadFirewall = useCallback(async () => {
    try {
      const [status, audit] = await Promise.all([
        invoke<FirewallStatus>("get_firewall_status"),
        invoke<FirewallEvent[]>("get_firewall_audit").catch(() => [] as FirewallEvent[]),
      ]);
      setFirewallStatus(status);
      setPrefs(status.prefs);
      setDomainDraft((status.prefs.domain_allowlist || []).join(", "));
      setBlocklistDraft((status.prefs.domain_blocklist || []).join(", "));
      setBlockedToolsDraft((status.prefs.blocked_tools || []).join(", "));
      setFirewallAudit(audit.slice().reverse());
    } catch {
      /* optional on older binary */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [next, preferences] = await Promise.all([
        invoke<SkillCatalogView>("list_skill_catalog"),
        invoke<SkillPreferences>("get_skill_preferences").catch(() => null),
      ]);
      setCatalog(next);
      if (preferences) {
        setPrefs(preferences);
        setDomainDraft(preferences.domain_allowlist.join(", "));
        setBlocklistDraft((preferences.domain_blocklist || []).join(", "));
        setBlockedToolsDraft((preferences.blocked_tools || []).join(", "));
      }
      await loadFirewall();
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [loadFirewall]);

  const loadRuntimes = useCallback(async () => {
    try {
      const list = await invoke<RuntimeStatus[]>("probe_skill_runtimes");
      setRuntimes(list);
    } catch (err) {
      setStatusMessage(String(err));
    }
  }, [setStatusMessage]);

  const loadCustom = useCallback(async () => {
    try {
      const list = await invoke<CustomSkillSummary[]>("list_custom_skills");
      setCustomSkills(list);
    } catch (err) {
      setStatusMessage(String(err));
    }
  }, [setStatusMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mainTab === "runtimes") void loadRuntimes();
    if (mainTab === "lab") {
      void loadCustom();
      void loadRuntimes();
    }
  }, [mainTab, loadRuntimes, loadCustom]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, categoryFilter, query]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalog?.packs ?? []) set.add(p.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const counts = useMemo(() => {
    const all = catalog?.packs ?? [];
    return {
      total: all.length,
      enabled: all.filter((p) => p.enabled).length,
      disabled: all.filter((p) => !p.enabled).length,
      high: all.filter((p) => p.risk === "high" || p.risk === "critical").length,
    };
  }, [catalog]);

  const packs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = catalog?.packs ?? [];
    if (statusFilter === "enabled") list = list.filter((p) => p.enabled);
    if (statusFilter === "disabled") list = list.filter((p) => !p.enabled);
    if (categoryFilter !== "all") list = list.filter((p) => p.category === categoryFilter);
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.when_to_use.toLowerCase().includes(q) ||
          p.tool_ids.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.name.localeCompare(b.name);
    });
  }, [catalog, statusFilter, categoryFilter, query]);

  const totalPages = Math.max(1, Math.ceil(packs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagePacks = packs.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const grouped = useMemo(() => {
    const map = new Map<string, SkillSummary[]>();
    for (const pack of pagePacks) {
      const list = map.get(pack.category) ?? [];
      list.push(pack);
      map.set(pack.category, list);
    }
    return Array.from(map.entries());
  }, [pagePacks]);

  const scopedCustom = useMemo(() => {
    let list = customSkills.filter((s) => s.scope === labScope);
    if (labFilter !== "all") {
      list = list.filter((s) => (s.runtime || "").toLowerCase() === labFilter);
    }
    return list;
  }, [customSkills, labScope, labFilter]);

  const isDirty = useMemo(() => {
    if (!baseline || !editMode) return false;
    return (
      skillMd !== baseline.skillMd ||
      entryName !== baseline.entryName ||
      entryContent !== baseline.entryContent ||
      displayName !== baseline.displayName
    );
  }, [baseline, editMode, skillMd, entryName, entryContent, displayName]);

  const applyDisplayNameToSkillMd = (md: string, name: string) => {
    if (!name.trim()) return md;
    if (/^name:\s*.+$/m.test(md)) {
      return md.replace(/^name:\s*.+$/m, `name: ${name.trim()}`);
    }
    // insert after id: if present
    if (/^id:\s*.+$/m.test(md)) {
      return md.replace(/^(id:\s*.+)$/m, `$1\nname: ${name.trim()}`);
    }
    return md;
  };

  const togglePack = async (pack: SkillSummary) => {
    const enabling = !pack.enabled;
    const needsPolicy =
      enabling &&
      (pack.risk === "high" || pack.risk === "critical") &&
      !(pack.risk === "high" ? prefs?.allow_high_risk : prefs?.allow_critical);
    if (needsPolicy) setSafetyOpen(true);
    setBusyId(pack.id);
    try {
      const next = await invoke<SkillCatalogView>("set_skill_pack_enabled", {
        request: { pack_id: pack.id, enabled: enabling },
      });
      setCatalog(next);
      setStatusMessage(enabling ? `Enabled ${pack.name}` : `Disabled ${pack.name}`);
      const preferences = await invoke<SkillPreferences>("get_skill_preferences");
      setPrefs(preferences);
    } catch (err) {
      setStatusMessage(String(err));
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  };

  const updatePolicy = async (patch: Partial<SkillPreferences>) => {
    try {
      const next = await invoke<SkillPreferences>("update_skill_policy", {
        update: {
          allow_high_risk: patch.allow_high_risk,
          allow_critical: patch.allow_critical,
          domain_allowlist: patch.domain_allowlist,
          firewall_enabled: patch.firewall_enabled,
          allow_network: patch.allow_network,
          allow_browser: patch.allow_browser,
          allow_scripts: patch.allow_scripts,
          allow_media_generate: patch.allow_media_generate,
          allow_social_post: patch.allow_social_post,
          dry_run_high: patch.dry_run_high,
          dry_run_critical: patch.dry_run_critical,
          domain_mode: patch.domain_mode,
          domain_blocklist: patch.domain_blocklist,
          allowed_script_runtimes: patch.allowed_script_runtimes,
          blocked_tools: patch.blocked_tools,
          blocked_permissions: patch.blocked_permissions,
          require_domain_for_fetch: patch.require_domain_for_fetch,
        },
      });
      setPrefs(next);
      const catalogNext = await invoke<SkillCatalogView>("list_skill_catalog");
      setCatalog(catalogNext);
      await loadFirewall();
      setStatusMessage(t("skills.firewallUpdated"));
    } catch (err) {
      setStatusMessage(String(err));
    }
  };

  const saveDomains = async () => {
    const list = domainDraft
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const block = blocklistDraft
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await updatePolicy({ domain_allowlist: list, domain_blocklist: block });
  };

  const saveBlockedTools = async () => {
    const list = blockedToolsDraft
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await updatePolicy({ blocked_tools: list });
  };

  const toggleRuntime = async (rt: string) => {
    const current = prefs?.allowed_script_runtimes ?? [];
    // empty = all allowed; first toggle materializes full set minus this one, or add
    const all = ["python", "node", "php", "sh", "rust"];
    let next: string[];
    if (current.length === 0) {
      next = all.filter((x) => x !== rt);
    } else if (current.includes(rt)) {
      next = current.filter((x) => x !== rt);
    } else {
      next = [...current, rt];
    }
    // if all selected, store empty = all
    if (next.length === all.length) next = [];
    await updatePolicy({ allowed_script_runtimes: next });
  };

  const runtimeAllowed = (rt: string) => {
    const list = prefs?.allowed_script_runtimes ?? [];
    return list.length === 0 || list.includes(rt);
  };

  const installRuntime = async (runtimeId: string) => {
    setRuntimeBusy(runtimeId);
    setRuntimeLog(null);
    try {
      const result = await invoke<{
        ok: boolean;
        message: string;
        log: string;
        status: RuntimeStatus;
      }>("install_skill_runtime", { request: { runtime_id: runtimeId } });
      setRuntimeLog(result.log || result.message);
      setStatusMessage(result.message);
      await loadRuntimes();
    } catch (err) {
      setStatusMessage(String(err));
      setRuntimeLog(String(err));
    } finally {
      setRuntimeBusy(null);
    }
  };

  const openCustom = async (skill: CustomSkillSummary, startEditing = false) => {
    if (isDirty && editMode) {
      const leave = await confirmDialog(t("skills.discardUnsaved"));
      if (!leave) return;
    }
    setSelectedCustomId(skill.id);
    setSelectedScope(skill.scope);
    setLabScope(skill.scope);
    setEditorTab("script");
    setEditMode(startEditing);
    try {
      const files = await invoke<{
        skill_md: string;
        entry: string | null;
        entry_content: string;
      }>("get_custom_skill_files", {
        request: { id: skill.id, scope: skill.scope },
      });
      const md = files.skill_md;
      const entry = files.entry ?? skill.entry ?? "";
      const content = files.entry_content;
      const nameMatch = md.match(/^name:\s*(.+)$/m);
      const name = (nameMatch?.[1] ?? skill.name).trim();
      setSkillMd(md);
      setEntryName(entry);
      setEntryContent(content);
      setDisplayName(name);
      setBaseline({
        skillMd: md,
        entryName: entry,
        entryContent: content,
        displayName: name,
      });
    } catch (err) {
      setStatusMessage(String(err));
    }
  };

  const startEdit = () => {
    if (!selectedCustomId) return;
    setEditMode(true);
    setEditorTab("script");
  };

  const discardEdit = async () => {
    if (!baseline) {
      setEditMode(false);
      return;
    }
    if (isDirty && !(await confirmDialog(t("skills.discardChanges")))) return;
    setSkillMd(baseline.skillMd);
    setEntryName(baseline.entryName);
    setEntryContent(baseline.entryContent);
    setDisplayName(baseline.displayName);
    setEditMode(false);
  };

  const createCustom = async () => {
    try {
      const created = await invoke<CustomSkillSummary>("create_custom_skill", {
        request: {
          id: newId || `skill-${newRuntime}`,
          name: newName || `My ${newRuntime} skill`,
          scope: labScope,
          runtime: newRuntime,
        },
      });
      setStatusMessage(t("status.skillCreated", { id: created.id }));
      setNewId("");
      setNewName("");
      await loadCustom();
      await load();
      await openCustom(created, true);
    } catch (err) {
      setStatusMessage(String(err));
    }
  };

  const saveCustom = async () => {
    if (!selectedCustomId) return;
    setSaveBusy(true);
    try {
      const md = applyDisplayNameToSkillMd(skillMd, displayName);
      await invoke("save_custom_skill_files", {
        request: {
          id: selectedCustomId,
          scope: selectedScope,
          skill_md: md,
          entry: entryName,
          entry_content: entryContent,
        },
      });
      setSkillMd(md);
      setBaseline({
        skillMd: md,
        entryName,
        entryContent,
        displayName,
      });
      setStatusMessage(t("status.skillSaved", { id: selectedCustomId }));
      setEditMode(false);
      await loadCustom();
      await load();
    } catch (err) {
      setStatusMessage(String(err));
    } finally {
      setSaveBusy(false);
    }
  };

  const deleteCustom = async () => {
    if (!selectedCustomId) return;
    if (
      !(await confirmDialog(
        `Delete skill "${selectedCustomId}"? This cannot be undone.`,
      ))
    ) {
      return;
    }
    try {
      await invoke("delete_custom_skill", {
        request: { id: selectedCustomId, scope: selectedScope },
      });
      setStatusMessage(t("status.skillDeleted", { id: selectedCustomId }));
      setSelectedCustomId(null);
      setBaseline(null);
      setEditMode(false);
      setSkillMd("");
      setEntryContent("");
      setDisplayName("");
      await loadCustom();
      await load();
    } catch (err) {
      setStatusMessage(String(err));
    }
  };

  const runTest = async () => {
    setTestBusy(true);
    setTestResult(null);
    try {
      const result = await invoke<ScriptRunResult>("test_skill_script", {
        request: {
          command: testCommand,
          skill_id: selectedCustomId,
          scope: selectedScope,
          timeout_secs: 15,
        },
      });
      setTestResult(result);
      setStatusMessage(result.ok ? t("skills.scriptOk") : result.error || t("skills.scriptFailed"));
    } catch (err) {
      setStatusMessage(String(err));
      setTestResult({
        ok: false,
        runtime: "",
        runtime_path: null,
        entry: "",
        argv: [],
        cwd: "",
        exit_code: null,
        stdout: "",
        stderr: "",
        duration_ms: 0,
        parsed_json: null,
        error: String(err),
      });
    } finally {
      setTestBusy(false);
    }
  };

  const modalPack = catalog?.packs.find((p) => p.id === modal?.packId) ?? null;
  const missingForEntry = useMemo(() => {
    const first = testCommand.trim().split(/\s+/)[0] || "";
    const ext = first.includes(".") ? first.slice(first.lastIndexOf(".")) : "";
    const map: Record<string, string> = {
      ".sh": "sh",
      ".php": "php",
      ".js": "node",
      ".mjs": "node",
      ".cjs": "node",
      ".py": "python",
      ".rs": "rust",
    };
    const rid = map[ext];
    if (!rid) return null;
    const rt = runtimes.find((r) => r.id === rid);
    if (rt && !rt.available) return rt;
    return null;
  }, [testCommand, runtimes]);

  return (
    <section id="skills" className="agents-card agents-card--wide skills-section" data-agents-section="skills">
      <header className="skills-header">
        <div className="skills-header-text">
          <div className="skills-title-row">
            <h3>{t("skills.title")}</h3>
          </div>
          <p className="skills-subtitle">{t("skills.subtitle")}</p>
        </div>
        <div className="skills-kpi">
          <div className="skills-kpi-item skills-kpi-item--on">
            <strong>{counts.enabled}</strong>
            <span>{t("skills.on")}</span>
          </div>
          <div className="skills-kpi-item">
            <strong>{counts.disabled}</strong>
            <span>{t("skills.off")}</span>
          </div>
          <div className="skills-kpi-item skills-kpi-item--warn">
            <strong>{counts.high}</strong>
            <span>{t("skills.highRisk")}</span>
          </div>
        </div>
      </header>

      <div className="skills-main-tabs" role="tablist" aria-label={t("skills.tabsAria")}>
        {(
          [
            ["catalog", "skills.tab.catalog"],
            ["lab", "skills.tab.lab"],
            ["runtimes", "skills.tab.runtimes"],
          ] as const
        ).map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mainTab === id}
            className={`skills-main-tab${mainTab === id ? " is-active" : ""}`}
            onClick={() => setMainTab(id)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {mainTab === "catalog" ? (
        <>
          <div className="fw-panel" data-testid="skills-firewall">
            {/* Status strip */}
            <div className="fw-status">
              <div className="fw-status-left">
                <span className="fw-status-icon" aria-hidden>
                  🛡
                </span>
                <div>
                  <div className="fw-status-title">{t("skills.firewall")}</div>
                  <div className="fw-status-sub muted">{t("skills.firewallSub")}</div>
                </div>
              </div>
              <div className="fw-status-right">
                <span
                  className={`fw-status-pill${prefs?.firewall_enabled === false ? " is-off" : " is-on"}`}
                >
                  {firewallStatus?.status_label ??
                    (prefs?.firewall_enabled === false
                      ? t("skills.off")
                      : prefs?.allow_critical
                        ? t("skills.criticalOpen")
                        : prefs?.allow_high_risk
                          ? t("skills.highOpen")
                          : t("skills.protected"))}
                </span>
                <SkillToggle
                  checked={prefs?.firewall_enabled !== false}
                  onChange={() =>
                    void updatePolicy({ firewall_enabled: prefs?.firewall_enabled === false })
                  }
                  label={t("skills.enableFirewall")}
                />
                <button
                  type="button"
                  className="skills-btn skills-btn--ghost fw-collapse-btn"
                  onClick={() => setSafetyOpen((v) => !v)}
                  aria-expanded={safetyOpen}
                >
                  {safetyOpen ? t("skills.hide") : t("skills.configure")}
                </button>
              </div>
            </div>

            {safetyOpen ? (
              <div className="fw-body">
                {/* KPI row */}
                <div className="fw-kpis">
                  <div className="fw-kpi">
                    <strong>{firewallStatus?.packs_runnable ?? counts.enabled}</strong>
                    <span>{t("skills.runnable")}</span>
                  </div>
                  <div className="fw-kpi">
                    <strong>{firewallStatus?.packs_blocked_risk ?? counts.high}</strong>
                    <span>{t("skills.riskGated")}</span>
                  </div>
                  <div className="fw-kpi">
                    <strong>{firewallStatus?.recent_blocks ?? 0}</strong>
                    <span>{t("skills.blocksLogged")}</span>
                  </div>
                </div>

                {/* Primary: risk + capabilities */}
                <div className="fw-grid-2">
                  <section className="fw-card">
                    <header className="fw-card-head">
                      <h4>{t("skills.riskLevel")}</h4>
                      <span className="muted">{t("skills.whatMayAttempt")}</span>
                    </header>
                    <div className="fw-risk-rows">
                      <div className="fw-row">
                        <div>
                          <strong>{t("skills.highRiskLabel")}</strong>
                          <span className="muted">{t("skills.highRiskDesc")}</span>
                        </div>
                        <SkillToggle
                          checked={!!prefs?.allow_high_risk}
                          onChange={() =>
                            void updatePolicy({ allow_high_risk: !prefs?.allow_high_risk })
                          }
                          label={t("skills.allowHighRisk")}
                        />
                      </div>
                      <div className="fw-row fw-row--critical">
                        <div>
                          <strong>{t("skills.criticalLabel")}</strong>
                          <span className="muted">{t("skills.criticalDesc")}</span>
                        </div>
                        <SkillToggle
                          checked={!!prefs?.allow_critical}
                          onChange={() =>
                            void updatePolicy({ allow_critical: !prefs?.allow_critical })
                          }
                          label={t("skills.allowCritical")}
                        />
                      </div>
                      <div className="fw-row">
                        <div>
                          <strong>{t("skills.dryRunCritical")}</strong>
                          <span className="muted">{t("skills.dryRunCriticalDesc")}</span>
                        </div>
                        <SkillToggle
                          checked={prefs?.dry_run_critical !== false}
                          onChange={() =>
                            void updatePolicy({
                              dry_run_critical: prefs?.dry_run_critical === false,
                            })
                          }
                          label={t("skills.dryRunCritical")}
                        />
                      </div>
                      <div className="fw-row">
                        <div>
                          <strong>{t("skills.dryRunHigh")}</strong>
                          <span className="muted">{t("skills.dryRunHighDesc")}</span>
                        </div>
                        <SkillToggle
                          checked={!!prefs?.dry_run_high}
                          onChange={() => void updatePolicy({ dry_run_high: !prefs?.dry_run_high })}
                          label={t("skills.dryRunHigh")}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="fw-card">
                    <header className="fw-card-head">
                      <h4>{t("skills.capabilities")}</h4>
                      <span className="muted">{t("skills.capabilitiesHint")}</span>
                    </header>
                    <div className="fw-pills">
                      {(
                        [
                          ["allow_network", "skills.cap.network", prefs?.allow_network !== false],
                          ["allow_browser", "skills.cap.browser", !!prefs?.allow_browser],
                          ["allow_scripts", "skills.cap.scripts", prefs?.allow_scripts !== false],
                          [
                            "allow_media_generate",
                            "skills.cap.media",
                            prefs?.allow_media_generate !== false,
                          ],
                          ["allow_social_post", "skills.cap.social", !!prefs?.allow_social_post],
                        ] as const
                      ).map(([key, labelKey, on]) => (
                        <button
                          key={key}
                          type="button"
                          className={`fw-pill${on ? " is-on" : ""}`}
                          onClick={() => void updatePolicy({ [key]: !on } as Partial<SkillPreferences>)}
                          aria-pressed={on}
                        >
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                    <p className="fw-hint muted">{t("skills.capHint")}</p>
                  </section>
                </div>

                {/* Advanced accordion */}
                <button
                  type="button"
                  className="fw-advanced-toggle"
                  onClick={() => setFwAdvanced((v) => !v)}
                  aria-expanded={fwAdvanced}
                >
                  <span>{t("skills.advancedToggle")}</span>
                  <span aria-hidden>{fwAdvanced ? "▴" : "▾"}</span>
                </button>

                {fwAdvanced ? (
                  <div className="fw-advanced">
                    <section className="fw-card">
                      <header className="fw-card-head">
                        <h4>{t("skills.domains")}</h4>
                      </header>
                      <div className="fw-seg" role="tablist" aria-label={t("skills.domainMode")}>
                        {(
                          [
                            ["open", "skills.domain.open"],
                            ["allowlist", "skills.domain.allowlist"],
                            ["blocklist", "skills.domain.blocklist"],
                          ] as const
                        ).map(([id, labelKey]) => (
                          <button
                            key={id}
                            type="button"
                            className={`fw-seg-btn${(prefs?.domain_mode ?? "open") === id ? " is-active" : ""}`}
                            onClick={() => void updatePolicy({ domain_mode: id })}
                          >
                            {t(labelKey)}
                          </button>
                        ))}
                      </div>
                      <label className="fw-field">
                        <span>{t("skills.allow")}</span>
                        <input
                          type="text"
                          value={domainDraft}
                          onChange={(e) => setDomainDraft(e.target.value)}
                          placeholder="docs.github.com, api.example.com"
                        />
                      </label>
                      <label className="fw-field">
                        <span>{t("skills.block")}</span>
                        <input
                          type="text"
                          value={blocklistDraft}
                          onChange={(e) => setBlocklistDraft(e.target.value)}
                          placeholder="ads.example.com"
                        />
                      </label>
                      <div className="fw-field-row">
                        <label className="fw-check">
                          <input
                            type="checkbox"
                            checked={!!prefs?.require_domain_for_fetch}
                            onChange={(e) =>
                              void updatePolicy({ require_domain_for_fetch: e.target.checked })
                            }
                          />
                          {t("skills.applyDomainRules")}
                        </label>
                        <button
                          type="button"
                          className="skills-btn skills-btn--ghost"
                          onClick={() => void saveDomains()}
                        >
                          {t("skills.saveDomains")}
                        </button>
                      </div>
                    </section>

                    <section className="fw-card">
                      <header className="fw-card-head">
                        <h4>{t("skills.scriptLanguages")}</h4>
                      </header>
                      <div className="fw-pills">
                        {(["python", "node", "php", "sh", "rust"] as const).map((rt) => (
                          <button
                            key={rt}
                            type="button"
                            className={`fw-pill${runtimeAllowed(rt) ? " is-on" : ""}`}
                            onClick={() => void toggleRuntime(rt)}
                            aria-pressed={runtimeAllowed(rt)}
                          >
                            {rt}
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="fw-card">
                      <header className="fw-card-head">
                        <h4>{t("skills.blockTools")}</h4>
                      </header>
                      <div className="fw-field-row">
                        <input
                          className="fw-grow"
                          type="text"
                          value={blockedToolsDraft}
                          onChange={(e) => setBlockedToolsDraft(e.target.value)}
                          placeholder="browser_click, x_post"
                        />
                        <button
                          type="button"
                          className="skills-btn skills-btn--ghost"
                          onClick={() => void saveBlockedTools()}
                        >
                          {t("skills.save")}
                        </button>
                      </div>
                    </section>

                    <section className="fw-card fw-card--audit">
                      <header className="fw-card-head">
                        <h4>{t("skills.recentDecisions")}</h4>
                        <div className="fw-audit-actions">
                          <button
                            type="button"
                            className="skills-btn skills-btn--ghost skills-btn--xs"
                            onClick={() => void loadFirewall()}
                          >
                            {t("skills.refresh")}
                          </button>
                          <button
                            type="button"
                            className="skills-btn skills-btn--ghost skills-btn--xs"
                            onClick={() =>
                              void invoke("clear_firewall_audit").then(() => loadFirewall())
                            }
                          >
                            {t("skills.clear")}
                          </button>
                        </div>
                      </header>
                      {firewallAudit.length === 0 ? (
                        <p className="muted fw-empty-audit">{t("skills.noAuditYet")}</p>
                      ) : (
                        <ul className="fw-audit-list">
                          {firewallAudit.slice(0, 8).map((ev, i) => (
                            <li key={`${ev.at}-${i}`}>
                              <span
                                className={`fw-audit-tag${ev.allow ? (ev.dry_run ? " is-dry" : " is-ok") : " is-block"}`}
                              >
                                {ev.allow
                                  ? ev.dry_run
                                    ? t("skills.audit.dry")
                                    : t("skills.audit.ok")
                                  : t("skills.audit.block")}
                              </span>
                              <code>{ev.tool}</code>
                              <span className="muted">{ev.layer ?? ""}</span>
                              <span className="fw-audit-reason muted">{ev.reason}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="skills-toolbar">
            <div className="skills-search">
              <span className="skills-search-icon" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("skills.search")}
                aria-label={t("skills.search")}
              />
            </div>
            <div className="skills-seg" role="tablist">
              {(
                [
                  ["all", t("skills.filterAll", { n: counts.total })],
                  ["enabled", t("skills.filterOn", { n: counts.enabled })],
                  ["disabled", t("skills.filterOff", { n: counts.disabled })],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`skills-seg-btn${statusFilter === id ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="skills-btn skills-btn--ghost" onClick={() => void load()}>
              {t("skills.refresh")}
            </button>
          </div>

          <div className="skills-cats">
            <button
              type="button"
              className={`skills-cat-chip${categoryFilter === "all" ? " is-active" : ""}`}
              onClick={() => setCategoryFilter("all")}
            >
              {t("skills.all")}
            </button>
            {categories.map((cat) => {
              const meta = categoryMeta(cat, t);
              return (
                <button
                  key={cat}
                  type="button"
                  className={`skills-cat-chip${categoryFilter === cat ? " is-active" : ""}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  <span aria-hidden>{meta.glyph}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>

          {error ? (
            <p className="hub-warning skills-error" role="alert">
              {error}
            </p>
          ) : null}
          {loading && !catalog ? (
            <div className="skills-empty">
              <div className="skills-skeleton-row" />
            </div>
          ) : null}

          <div className="skills-groups">
            {grouped.map(([category, items]) => {
              const meta = categoryMeta(category, t);
              return (
                <div key={category} className="skills-group">
                  <div className="skills-group-head">
                    <span className="skills-group-glyph">{meta.glyph}</span>
                    <h4>{meta.label}</h4>
                    <span className="muted">{items.length}</span>
                  </div>
                  <ul className="skills-list">
                    {items.map((pack) => (
                      <li key={pack.id} className={`skills-row${pack.enabled ? " is-on" : " is-off"}`}>
                        <div className="skills-row-main">
                          <button
                            type="button"
                            className="skills-row-expand"
                            onClick={() => setModal({ packId: pack.id })}
                          >
                            <span className="skills-row-glyph">{meta.glyph}</span>
                            <div className="skills-row-copy">
                              <div className="skills-row-title">
                                <strong>{pack.name}</strong>
                                <span className={`skills-risk skills-risk--${pack.risk}`}>
                                  {t(RISK_KEY[pack.risk])}
                                </span>
                                <span className="skills-badge">{pack.source}</span>
                              </div>
                              <p className="skills-row-desc">{pack.when_to_use}</p>
                            </div>
                          </button>
                          <div className="skills-row-side">
                            <span className="skills-cost">{t(COST_KEY[pack.token_cost_class])}</span>
                            <SkillToggle
                              checked={pack.enabled}
                              busy={busyId === pack.id}
                              onChange={() => void togglePack(pack)}
                              label={
                                pack.enabled
                                  ? t("skills.disablePack", { name: pack.name })
                                  : t("skills.enablePack", { name: pack.name })
                              }
                            />
                          </div>
                        </div>
                        <div className="skills-row-detail skills-row-detail--always">
                          <div className="skills-detail-meta">
                            <code>{pack.id}</code>
                            {pack.entry ? <span className="muted">· {pack.entry}</span> : null}
                            <span className="muted">
                              · {t("skills.toolsCount", { n: pack.tool_ids.length })}
                            </span>
                          </div>
                          <div className="skills-tool-btns">
                            {pack.tool_ids.map((tool) => (
                              <button
                                key={tool}
                                type="button"
                                className="skills-tool-btn"
                                onClick={() => setModal({ packId: pack.id, toolId: tool })}
                              >
                                <code>{tool}</code>
                                <span>{t("skills.view")}</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="skills-tool-btn skills-tool-btn--primary"
                              onClick={() => setModal({ packId: pack.id })}
                            >
                              <span>{t("skills.openSkill")}</span>
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {packs.length > 0 ? (
            <div className="skills-pagination">
              <span className="muted skills-page-summary">
                {t("skills.showing", {
                  from: safePage * PAGE_SIZE + 1,
                  to: Math.min((safePage + 1) * PAGE_SIZE, packs.length),
                  total: packs.length,
                })}
              </span>
              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
                label={t("skills.paginationLabel")}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {mainTab === "lab" ? (
        <div className="skills-lab">
          <div className="skills-lab-toolbar">
            <div className="skills-seg" role="tablist" aria-label={t("skills.scopeAria")}>
              {(
                [
                  ["company", "skills.scope.company"],
                  ["global", "skills.scope.global"],
                ] as const
              ).map(([id, labelKey]) => (
                <button
                  key={id}
                  type="button"
                  className={`skills-seg-btn${labScope === id ? " is-active" : ""}`}
                  onClick={() => {
                    void (async () => {
                      if (isDirty && editMode) {
                        if (!(await confirmDialog(t("skills.discardChanges")))) return;
                      }
                      setLabScope(id);
                      setSelectedCustomId(null);
                      setEditMode(false);
                      setBaseline(null);
                    })();
                  }}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <div className="skills-lab-create">
              <input
                type="text"
                placeholder="skill-id"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                aria-label={t("skills.newSkillId")}
              />
              <input
                type="text"
                placeholder={t("skills.displayNamePh")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-label={t("skills.newSkillName")}
              />
              <select
                value={newRuntime}
                onChange={(e) => setNewRuntime(e.target.value)}
                aria-label={t("skills.runtime")}
              >
                <option value="php">PHP</option>
                <option value="node">Node.js</option>
                <option value="python">Python</option>
                <option value="sh">Shell</option>
                <option value="rust">Rust</option>
              </select>
              <button type="button" className="skills-btn skills-btn--ghost" onClick={() => void createCustom()}>
                {t("skills.newSkill")}
              </button>
            </div>
          </div>

          <div className="skills-lab-layout">
            <aside className="skills-lab-list">
              <h4>
                {t("skills.scopeSkills", {
                  scope: t(labScope === "global" ? "skills.scope.global" : "skills.scope.company"),
                  n: scopedCustom.length,
                })}
              </h4>
              {labScope === "global" ? (
                <p className="muted skills-lab-list-hint">{t("skills.globalStartersHint")}</p>
              ) : null}
              <div className="skills-lab-filter">
                <select
                  value={labFilter}
                  onChange={(e) => setLabFilter(e.target.value)}
                  aria-label={t("skills.filterRuntime")}
                >
                  <option value="all">{t("skills.allRuntimes")}</option>
                  <option value="python">Python</option>
                  <option value="php">PHP</option>
                  <option value="node">Node.js</option>
                  <option value="sh">Shell</option>
                  <option value="rust">Rust</option>
                </select>
              </div>
              {scopedCustom.length === 0 ? (
                <p className="muted">
                  {t("skills.noScopeSkills", {
                    scope: t(labScope === "global" ? "skills.scope.global" : "skills.scope.company"),
                  })}
                  {labScope === "company" ? t("skills.noCompanyHint") : t("skills.noGlobalHint")}
                </p>
              ) : (
                <ul className="skills-lab-list-scroll">
                  {scopedCustom.map((s) => (
                    <li key={`${s.scope}-${s.id}`} className="skills-lab-list-item">
                      <button
                        type="button"
                        className={`skills-lab-list-main${selectedCustomId === s.id && selectedScope === s.scope ? " is-active" : ""}`}
                        onClick={() => void openCustom(s, false)}
                        title={`${s.name} (${s.id})`}
                      >
                        <strong>{s.name}</strong>
                        <span className="muted">
                          {s.id} · {s.runtime ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <div className={`skills-lab-editor${editMode ? " is-editing" : ""}`}>
              {selectedCustomId ? (
                <>
                  <div className="skills-lab-editor-actions">
                    <div className="skills-lab-editor-title">
                      <strong>{displayName || selectedCustomId}</strong>
                      <span className="muted">
                        <code>{selectedCustomId}</code> · {selectedScope}
                        {isDirty ? <span className="skills-lab-dirty"> · {t("skills.unsaved")}</span> : null}
                      </span>
                    </div>
                    <div className="skills-lab-editor-btns">
                      {!editMode ? (
                        <button type="button" className="skills-btn skills-btn--primary" onClick={startEdit}>
                          {t("skills.edit")}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="skills-btn skills-btn--primary"
                            disabled={saveBusy || !isDirty}
                            onClick={() => void saveCustom()}
                          >
                            {saveBusy ? t("skills.saving") : t("skills.save")}
                          </button>
                          <button type="button" className="skills-btn skills-btn--ghost" onClick={discardEdit}>
                            {t("skills.discard")}
                          </button>
                        </>
                      )}
                      <button type="button" className="skills-btn skills-btn--ghost" onClick={() => void deleteCustom()}>
                        {t("skills.delete")}
                      </button>
                    </div>
                  </div>

                  {!editMode ? (
                    <p className="muted skills-lab-readonly-hint">
                      {t("skills.readonlyHint", { id: selectedCustomId })}
                    </p>
                  ) : null}

                  <div className="skills-lab-editor-tabs" role="tablist">
                    {(
                      [
                        ["script", "skills.editor.script"],
                        ["manifest", "skills.editor.manifest"],
                        ["meta", "skills.editor.meta"],
                      ] as const
                    ).map(([id, labelKey]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        className={`skills-lab-editor-tab${editorTab === id ? " is-active" : ""}`}
                        onClick={() => setEditorTab(id)}
                      >
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>

                  {editorTab === "script" ? (
                    <div className="skills-lab-editor-pane">
                      <label className="skills-domain-label">
                        {t("skills.entryFile")}
                        <input
                          type="text"
                          value={entryName}
                          disabled={!editMode}
                          onChange={(e) => setEntryName(e.target.value)}
                          placeholder="main.py"
                        />
                      </label>
                      <label className="skills-domain-label">
                        {t("skills.scriptSource")}
                        <textarea
                          className="skills-lab-textarea skills-lab-textarea--code"
                          value={entryContent}
                          disabled={!editMode}
                          onChange={(e) => setEntryContent(e.target.value)}
                          rows={16}
                          spellCheck={false}
                        />
                      </label>
                    </div>
                  ) : null}

                  {editorTab === "manifest" ? (
                    <div className="skills-lab-editor-pane">
                      <label className="skills-domain-label">
                        SKILL.md
                        <textarea
                          className="skills-lab-textarea skills-lab-textarea--code"
                          value={skillMd}
                          disabled={!editMode}
                          onChange={(e) => setSkillMd(e.target.value)}
                          rows={18}
                          spellCheck={false}
                        />
                      </label>
                    </div>
                  ) : null}

                  {editorTab === "meta" ? (
                    <div className="skills-lab-editor-pane">
                      <label className="skills-domain-label">
                        {t("skills.displayName")}
                        <input
                          type="text"
                          value={displayName}
                          disabled={!editMode}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder={t("skills.displayNamePh")}
                        />
                      </label>
                      <label className="skills-domain-label">
                        {t("skills.skillId")}
                        <input type="text" value={selectedCustomId} disabled readOnly />
                      </label>
                      <label className="skills-domain-label">
                        {t("skills.scopeLabel")}
                        <input type="text" value={selectedScope} disabled readOnly />
                      </label>
                      <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
                        {t("skills.metaLocked")}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="skills-lab-empty-editor">
                  <p className="muted">{t("skills.selectThenEdit")}</p>
                  <p className="muted">{t("skills.orCreate")}</p>
                </div>
              )}
            </div>
          </div>

          <div className="skills-lab-test">
            <h4>{t("skills.testRunner")}</h4>
            <p className="skills-lab-test-lead">{t("skills.testLead")}</p>

            <div className="skills-lab-format" aria-label={t("skills.cmdFormat")}>
              <p className="skills-lab-format-title">{t("skills.cmdFormat")}</p>
              <div className="skills-lab-format-example">
                <code className="skills-lab-cmd">
                  <span className="skills-lab-tok skills-lab-tok--file">main.py</span>
                  <span className="skills-lab-tok skills-lab-tok--arg">notes.md</span>
                </code>
              </div>
              <ol className="skills-lab-format-steps">
                <li>
                  {t("skills.cmdFormatEntry", { file: "main.py" })}
                </li>
                <li>
                  {t("skills.cmdFormatArgs", { arg: "notes.md" })}
                </li>
                <li>{t("skills.cmdFormatOut")}</li>
              </ol>
              <div className="skills-lab-examples">
                <p className="skills-lab-format-title">{t("skills.tryThese")}</p>
                <ul className="skills-lab-example-list">
                  {(
                    [
                      ["main.py notes.md", "py-extract-urls"],
                      ["main.js package.json", "js-package-info"],
                      ["main.php payload.json", "php-json-validate"],
                      ["main.sh", "sh-git-status"],
                      ["main.rs ./artifact.bin", "rs-sha256"],
                    ] as const
                  ).map(([cmd, lang]) => (
                    <li key={cmd}>
                      <button
                        type="button"
                        className="skills-lab-example-btn"
                        onClick={() => setTestCommand(cmd)}
                        title={t("skills.useExample", { cmd })}
                      >
                        <code>{cmd}</code>
                        <span className="muted">{lang}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {missingForEntry ? (
              <div className="hub-warning skills-lab-missing">
                <span>
                  {t("skills.cannotRun", {
                    label: missingForEntry.label,
                    hint: missingForEntry.install_hint ?? "",
                  })}
                </span>
                {missingForEntry.installable ? (
                  <button
                    type="button"
                    className="skills-btn skills-btn--ghost"
                    disabled={runtimeBusy === missingForEntry.id}
                    onClick={() => void installRuntime(missingForEntry.id)}
                  >
                    {runtimeBusy === missingForEntry.id ? t("skills.installing") : t("skills.installNow")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="skills-btn skills-btn--ghost"
                  onClick={() => setMainTab("runtimes")}
                >
                  {t("skills.openRuntimes")}
                </button>
              </div>
            ) : null}

            <label className="skills-lab-test-label" htmlFor="skills-lab-command">
              {t("skills.commandLine")}
            </label>
            <div className="skills-lab-test-row">
              <input
                id="skills-lab-command"
                type="text"
                value={testCommand}
                onChange={(e) => setTestCommand(e.target.value)}
                placeholder="main.py notes.md"
                aria-label={t("skills.testCommandAria")}
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runTest();
                }}
              />
              <button
                type="button"
                className="skills-btn skills-btn--primary"
                disabled={testBusy || !testCommand.trim()}
                onClick={() => void runTest()}
              >
                {testBusy ? t("skills.running") : t("skills.run")}
              </button>
            </div>

            {testResult ? (
              <div className="skills-code-block-wrap">
                <div className="skills-code-block-bar">
                  <span>
                    {t("skills.jsonOutput", {
                      status: testResult.ok ? t("skills.success") : t("skills.failed"),
                      runtime: testResult.runtime || t("skills.noRuntime"),
                      ms: testResult.duration_ms,
                      exit:
                        testResult.exit_code != null
                          ? t("skills.exitCode", { code: testResult.exit_code })
                          : "",
                    })}
                  </span>
                  <button
                    type="button"
                    className="skills-btn skills-btn--ghost skills-btn--xs"
                    onClick={() =>
                      void navigator.clipboard?.writeText(JSON.stringify(testResult, null, 2))
                    }
                  >
                    {t("skills.copyJson")}
                  </button>
                </div>
                <pre className="skills-code-block skills-code-block--tall">
                  <code>{JSON.stringify(testResult, null, 2)}</code>
                </pre>
              </div>
            ) : (
              <p className="muted skills-lab-test-hint">{t("skills.testHint")}</p>
            )}
          </div>
        </div>
      ) : null}

      {mainTab === "runtimes" ? (
        <div className="skills-runtimes">
          <div className="skills-lab-toolbar">
            <p className="muted" style={{ margin: 0 }}>
              {t("skills.runtimesLead")}
            </p>
            <button type="button" className="skills-btn skills-btn--ghost" onClick={() => void loadRuntimes()}>
              {t("skills.recheck")}
            </button>
          </div>
          <table className="skills-runtime-table">
            <thead>
              <tr>
                <th>{t("skills.th.runtime")}</th>
                <th>{t("skills.th.status")}</th>
                <th>{t("skills.th.version")}</th>
                <th>{t("skills.th.path")}</th>
                <th>{t("skills.th.extensions")}</th>
                <th>{t("skills.th.action")}</th>
              </tr>
            </thead>
            <tbody>
              {runtimes.map((rt) => (
                <tr key={rt.id}>
                  <td>
                    <strong>{rt.label}</strong>
                  </td>
                  <td>
                    <span className={`skills-badge${rt.available ? " skills-badge--on" : " skills-badge--lock"}`}>
                      {rt.available ? t("skills.ready") : t("skills.missing")}
                    </span>
                    <span className="muted" style={{ marginLeft: 6, fontSize: "0.72rem" }}>
                      {rt.source}
                    </span>
                  </td>
                  <td className="muted">{rt.version ?? "—"}</td>
                  <td>
                    <code style={{ fontSize: "0.72rem" }}>{rt.path ?? "—"}</code>
                  </td>
                  <td className="muted">{rt.extensions.join(" ")}</td>
                  <td>
                    {!rt.available && rt.installable ? (
                      <button
                        type="button"
                        className="skills-btn skills-btn--ghost"
                        disabled={runtimeBusy === rt.id}
                        onClick={() => void installRuntime(rt.id)}
                      >
                        {runtimeBusy === rt.id ? t("skills.installing") : t("skills.install")}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runtimeLog ? (
            <div className="skills-code-block-wrap" style={{ marginTop: "1rem" }}>
              <div className="skills-code-block-bar">
                <span>{t("skills.installLog")}</span>
              </div>
              <pre className="skills-code-block">
                <code>{runtimeLog}</code>
              </pre>
            </div>
          ) : null}
          {runtimes.some((r) => !r.available && r.install_hint) ? (
            <ul className="muted" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
              {runtimes
                .filter((r) => !r.available && r.install_hint)
                .map((r) => (
                  <li key={r.id}>
                    <strong>{r.label}:</strong> {r.install_hint}
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {modal && modalPack ? (
        <SkillDetailModal
          packId={modal.packId}
          focusToolId={modal.toolId}
          enabled={modalPack.enabled}
          busy={busyId === modal.packId}
          onClose={() => setModal(null)}
          onToggle={() => void togglePack(modalPack)}
        />
      ) : null}
    </section>
  );
}
