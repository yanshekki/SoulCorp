import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameStore } from "../../../stores/gameStore";
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

const RISK_LABEL: Record<SkillSummary["risk"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const COST_LABEL: Record<SkillSummary["token_cost_class"], string> = {
  light: "Light",
  medium: "Medium",
  heavy: "Heavy",
};

const CATEGORY_META: Record<string, { label: string; glyph: string }> = {
  research: { label: "Research", glyph: "🔍" },
  engineering: { label: "Engineering", glyph: "⚙️" },
  media: { label: "Media", glyph: "🎨" },
  growth: { label: "Growth", glyph: "🚀" },
  ops: { label: "Ops", glyph: "📋" },
  general: { label: "General", glyph: "✨" },
};

function categoryMeta(category: string) {
  return (
    CATEGORY_META[category.toLowerCase()] ?? {
      label: category.charAt(0).toUpperCase() + category.slice(1),
      glyph: "◆",
    }
  );
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

  const selectedTool = pack?.tools.find((t) => t.id === selectedToolId) ?? null;
  const meta = pack ? categoryMeta(pack.category) : null;

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
            <p className="skills-modal-eyebrow">Skill pack</p>
            <h3 id="skills-modal-title">{pack?.name ?? packId}</h3>
            {pack ? (
              <div className="skills-modal-badges">
                <span className={`skills-risk skills-risk--${pack.risk}`}>{RISK_LABEL[pack.risk]}</span>
                <span className="skills-badge">{meta?.label}</span>
                <span className="skills-badge">{pack.source}</span>
                <span className={`skills-badge${enabled ? " skills-badge--on" : ""}`}>
                  {enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            ) : null}
          </div>
          <div className="skills-modal-header-actions">
            <SkillToggle
              checked={enabled}
              busy={busy}
              onChange={onToggle}
              label={enabled ? `Disable ${pack?.name ?? packId}` : `Enable ${pack?.name ?? packId}`}
            />
            <button type="button" className="skills-btn skills-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="skills-modal-tabs" role="tablist">
          {(
            [
              ["overview", "Overview"],
              ["tools", `Tools${pack ? ` (${pack.tools.length})` : ""}`],
              ["source", "Source"],
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
          {loading ? <p className="muted">Loading skill pack…</p> : null}
          {error ? (
            <p className="hub-warning" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && pack && tab === "overview" ? (
            <div className="skills-modal-overview">
              <section>
                <h4>When to use</h4>
                <p>{pack.when_to_use}</p>
              </section>
              <section>
                <h4>Identity</h4>
                <dl className="skills-meta-grid">
                  <div>
                    <dt>ID</dt>
                    <dd>
                      <code>{pack.id}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{pack.source}</dd>
                  </div>
                  {pack.entry ? (
                    <div>
                      <dt>Entry</dt>
                      <dd>
                        <code>{pack.entry}</code>
                      </dd>
                    </div>
                  ) : null}
                  {pack.runtime ? (
                    <div>
                      <dt>Runtime</dt>
                      <dd>{pack.runtime}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
              <section>
                <h4>Tools</h4>
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
                      <span>View</span>
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
                    <span className="muted">{tool.parameters.length} params</span>
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
                      <h5>Parameters</h5>
                      {selectedTool.parameters.length === 0 ? (
                        <p className="muted">No parameters.</p>
                      ) : (
                        <table className="skills-param-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Type</th>
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
                        <span>Call shape</span>
                        <button
                          type="button"
                          className="skills-btn skills-btn--ghost skills-btn--xs"
                          onClick={() => void navigator.clipboard?.writeText(toolSchemaCode(selectedTool))}
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="skills-code-block">
                        <code>{toolSchemaCode(selectedTool)}</code>
                      </pre>
                    </div>
                  </>
                ) : (
                  <p className="muted">Select a tool.</p>
                )}
              </div>
            </div>
          ) : null}

          {!loading && pack && tab === "source" ? (
            <div className="skills-code-block-wrap skills-source-block">
              <div className="skills-code-block-bar">
                <span>SKILL.md body</span>
                <button
                  type="button"
                  className="skills-btn skills-btn--ghost skills-btn--xs"
                  onClick={() => void navigator.clipboard?.writeText(pack.body || "")}
                >
                  Copy
                </button>
              </div>
              <pre className="skills-code-block skills-code-block--tall">
                <code>{pack.body?.trim() || "/* empty body */"}</code>
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SkillsCatalogSection() {
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
      setStatusMessage("Skills Firewall updated");
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
      const leave = window.confirm("You have unsaved changes. Discard them?");
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

  const discardEdit = () => {
    if (!baseline) {
      setEditMode(false);
      return;
    }
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
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
      setStatusMessage(`Created skill ${created.id}`);
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
      setStatusMessage(`Saved ${selectedCustomId}`);
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
    if (!window.confirm(`Delete skill "${selectedCustomId}"? This cannot be undone.`)) return;
    try {
      await invoke("delete_custom_skill", {
        request: { id: selectedCustomId, scope: selectedScope },
      });
      setStatusMessage(`Deleted ${selectedCustomId}`);
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
      setStatusMessage(result.ok ? "Script OK" : result.error || "Script failed");
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
            <h3>Agent Skills</h3>
          </div>
          <p className="skills-subtitle">
            Catalog turns packs on/off. Lab lets you add scripts and run them. Runtimes checks PHP,
            Node, Python, Shell, and Rust on this machine.
          </p>
        </div>
        <div className="skills-kpi">
          <div className="skills-kpi-item skills-kpi-item--on">
            <strong>{counts.enabled}</strong>
            <span>On</span>
          </div>
          <div className="skills-kpi-item">
            <strong>{counts.disabled}</strong>
            <span>Off</span>
          </div>
          <div className="skills-kpi-item skills-kpi-item--warn">
            <strong>{counts.high}</strong>
            <span>High risk</span>
          </div>
        </div>
      </header>

      <div className="skills-main-tabs" role="tablist" aria-label="Skills sections">
        {(
          [
            ["catalog", "Catalog"],
            ["lab", "Lab"],
            ["runtimes", "Runtimes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mainTab === id}
            className={`skills-main-tab${mainTab === id ? " is-active" : ""}`}
            onClick={() => setMainTab(id)}
          >
            {label}
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
                  <div className="fw-status-title">Skills Firewall</div>
                  <div className="fw-status-sub muted">
                    Blocks unsafe agent tools before they run. Lab uses the same rules.
                  </div>
                </div>
              </div>
              <div className="fw-status-right">
                <span
                  className={`fw-status-pill${prefs?.firewall_enabled === false ? " is-off" : " is-on"}`}
                >
                  {firewallStatus?.status_label ??
                    (prefs?.firewall_enabled === false
                      ? "Off"
                      : prefs?.allow_critical
                        ? "Critical open"
                        : prefs?.allow_high_risk
                          ? "High open"
                          : "Protected")}
                </span>
                <SkillToggle
                  checked={prefs?.firewall_enabled !== false}
                  onChange={() =>
                    void updatePolicy({ firewall_enabled: prefs?.firewall_enabled === false })
                  }
                  label="Enable firewall"
                />
                <button
                  type="button"
                  className="skills-btn skills-btn--ghost fw-collapse-btn"
                  onClick={() => setSafetyOpen((v) => !v)}
                  aria-expanded={safetyOpen}
                >
                  {safetyOpen ? "Hide" : "Configure"}
                </button>
              </div>
            </div>

            {safetyOpen ? (
              <div className="fw-body">
                {/* KPI row */}
                <div className="fw-kpis">
                  <div className="fw-kpi">
                    <strong>{firewallStatus?.packs_runnable ?? counts.enabled}</strong>
                    <span>Runnable</span>
                  </div>
                  <div className="fw-kpi">
                    <strong>{firewallStatus?.packs_blocked_risk ?? counts.high}</strong>
                    <span>Risk-gated</span>
                  </div>
                  <div className="fw-kpi">
                    <strong>{firewallStatus?.recent_blocks ?? 0}</strong>
                    <span>Blocks logged</span>
                  </div>
                </div>

                {/* Primary: risk + capabilities */}
                <div className="fw-grid-2">
                  <section className="fw-card">
                    <header className="fw-card-head">
                      <h4>Risk level</h4>
                      <span className="muted">What agents may attempt</span>
                    </header>
                    <div className="fw-risk-rows">
                      <div className="fw-row">
                        <div>
                          <strong>High</strong>
                          <span className="muted">Browser · scripts · sandbox · social</span>
                        </div>
                        <SkillToggle
                          checked={!!prefs?.allow_high_risk}
                          onChange={() =>
                            void updatePolicy({ allow_high_risk: !prefs?.allow_high_risk })
                          }
                          label="Allow high risk"
                        />
                      </div>
                      <div className="fw-row fw-row--critical">
                        <div>
                          <strong>Critical</strong>
                          <span className="muted">Form submit · register · web comment</span>
                        </div>
                        <SkillToggle
                          checked={!!prefs?.allow_critical}
                          onChange={() =>
                            void updatePolicy({ allow_critical: !prefs?.allow_critical })
                          }
                          label="Allow critical risk"
                        />
                      </div>
                      <div className="fw-row">
                        <div>
                          <strong>Dry-run critical</strong>
                          <span className="muted">Plan only — no real writes</span>
                        </div>
                        <SkillToggle
                          checked={prefs?.dry_run_critical !== false}
                          onChange={() =>
                            void updatePolicy({
                              dry_run_critical: prefs?.dry_run_critical === false,
                            })
                          }
                          label="Dry-run critical"
                        />
                      </div>
                      <div className="fw-row">
                        <div>
                          <strong>Dry-run high</strong>
                          <span className="muted">Simulate high-risk tools</span>
                        </div>
                        <SkillToggle
                          checked={!!prefs?.dry_run_high}
                          onChange={() => void updatePolicy({ dry_run_high: !prefs?.dry_run_high })}
                          label="Dry-run high"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="fw-card">
                    <header className="fw-card-head">
                      <h4>Capabilities</h4>
                      <span className="muted">Fine-grained tool classes</span>
                    </header>
                    <div className="fw-pills">
                      {(
                        [
                          ["allow_network", "Network", prefs?.allow_network !== false],
                          ["allow_browser", "Browser", !!prefs?.allow_browser],
                          ["allow_scripts", "Scripts", prefs?.allow_scripts !== false],
                          ["allow_media_generate", "Media", prefs?.allow_media_generate !== false],
                          ["allow_social_post", "Social", !!prefs?.allow_social_post],
                        ] as const
                      ).map(([key, label, on]) => (
                        <button
                          key={key}
                          type="button"
                          className={`fw-pill${on ? " is-on" : ""}`}
                          onClick={() => void updatePolicy({ [key]: !on } as Partial<SkillPreferences>)}
                          aria-pressed={on}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="fw-hint muted">
                      Scripts &amp; browser need <strong>High</strong> on. Social needs High + Social.
                    </p>
                  </section>
                </div>

                {/* Advanced accordion */}
                <button
                  type="button"
                  className="fw-advanced-toggle"
                  onClick={() => setFwAdvanced((v) => !v)}
                  aria-expanded={fwAdvanced}
                >
                  <span>Advanced · domains, runtimes, tool blocks, audit</span>
                  <span aria-hidden>{fwAdvanced ? "▴" : "▾"}</span>
                </button>

                {fwAdvanced ? (
                  <div className="fw-advanced">
                    <section className="fw-card">
                      <header className="fw-card-head">
                        <h4>Domains</h4>
                      </header>
                      <div className="fw-seg" role="tablist" aria-label="Domain mode">
                        {(
                          [
                            ["open", "Open"],
                            ["allowlist", "Allowlist"],
                            ["blocklist", "Blocklist"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={`fw-seg-btn${(prefs?.domain_mode ?? "open") === id ? " is-active" : ""}`}
                            onClick={() => void updatePolicy({ domain_mode: id })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className="fw-field">
                        <span>Allow</span>
                        <input
                          type="text"
                          value={domainDraft}
                          onChange={(e) => setDomainDraft(e.target.value)}
                          placeholder="docs.github.com, api.example.com"
                        />
                      </label>
                      <label className="fw-field">
                        <span>Block</span>
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
                          Apply domain rules to search &amp; fetch
                        </label>
                        <button
                          type="button"
                          className="skills-btn skills-btn--ghost"
                          onClick={() => void saveDomains()}
                        >
                          Save domains
                        </button>
                      </div>
                    </section>

                    <section className="fw-card">
                      <header className="fw-card-head">
                        <h4>Script languages</h4>
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
                        <h4>Block specific tools</h4>
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
                          Save
                        </button>
                      </div>
                    </section>

                    <section className="fw-card fw-card--audit">
                      <header className="fw-card-head">
                        <h4>Recent decisions</h4>
                        <div className="fw-audit-actions">
                          <button
                            type="button"
                            className="skills-btn skills-btn--ghost skills-btn--xs"
                            onClick={() => void loadFirewall()}
                          >
                            Refresh
                          </button>
                          <button
                            type="button"
                            className="skills-btn skills-btn--ghost skills-btn--xs"
                            onClick={() =>
                              void invoke("clear_firewall_audit").then(() => loadFirewall())
                            }
                          >
                            Clear
                          </button>
                        </div>
                      </header>
                      {firewallAudit.length === 0 ? (
                        <p className="muted fw-empty-audit">No events yet — run a tool or Lab command.</p>
                      ) : (
                        <ul className="fw-audit-list">
                          {firewallAudit.slice(0, 8).map((ev, i) => (
                            <li key={`${ev.at}-${i}`}>
                              <span
                                className={`fw-audit-tag${ev.allow ? (ev.dry_run ? " is-dry" : " is-ok") : " is-block"}`}
                              >
                                {ev.allow ? (ev.dry_run ? "DRY" : "OK") : "BLOCK"}
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
                placeholder="Search skills…"
                aria-label="Search skills"
              />
            </div>
            <div className="skills-seg" role="tablist">
              {(
                [
                  ["all", `All ${counts.total}`],
                  ["enabled", `On ${counts.enabled}`],
                  ["disabled", `Off ${counts.disabled}`],
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
              Refresh
            </button>
          </div>

          <div className="skills-cats">
            <button
              type="button"
              className={`skills-cat-chip${categoryFilter === "all" ? " is-active" : ""}`}
              onClick={() => setCategoryFilter("all")}
            >
              All
            </button>
            {categories.map((cat) => {
              const meta = categoryMeta(cat);
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
              const meta = categoryMeta(category);
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
                                  {RISK_LABEL[pack.risk]}
                                </span>
                                <span className="skills-badge">{pack.source}</span>
                              </div>
                              <p className="skills-row-desc">{pack.when_to_use}</p>
                            </div>
                          </button>
                          <div className="skills-row-side">
                            <span className="skills-cost">{COST_LABEL[pack.token_cost_class]}</span>
                            <SkillToggle
                              checked={pack.enabled}
                              busy={busyId === pack.id}
                              onChange={() => void togglePack(pack)}
                              label={pack.enabled ? `Disable ${pack.name}` : `Enable ${pack.name}`}
                            />
                          </div>
                        </div>
                        <div className="skills-row-detail skills-row-detail--always">
                          <div className="skills-detail-meta">
                            <code>{pack.id}</code>
                            {pack.entry ? <span className="muted">· {pack.entry}</span> : null}
                            <span className="muted">· {pack.tool_ids.length} tools</span>
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
                                <span>View</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className="skills-tool-btn skills-tool-btn--primary"
                              onClick={() => setModal({ packId: pack.id })}
                            >
                              <span>Open skill</span>
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
                Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, packs.length)} of{" "}
                {packs.length}
              </span>
              <PaginationBar page={safePage} totalPages={totalPages} onPageChange={setPage} label="Skills" />
            </div>
          ) : null}
        </>
      ) : null}

      {mainTab === "lab" ? (
        <div className="skills-lab">
          <div className="skills-lab-toolbar">
            <div className="skills-seg" role="tablist" aria-label="Skill scope">
              {(
                [
                  ["company", "Company"],
                  ["global", "Global"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`skills-seg-btn${labScope === id ? " is-active" : ""}`}
                  onClick={() => {
                    if (isDirty && editMode) {
                      if (!window.confirm("Discard unsaved changes?")) return;
                    }
                    setLabScope(id);
                    setSelectedCustomId(null);
                    setEditMode(false);
                    setBaseline(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="skills-lab-create">
              <input
                type="text"
                placeholder="skill-id"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                aria-label="New skill id"
              />
              <input
                type="text"
                placeholder="Display name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-label="New skill name"
              />
              <select value={newRuntime} onChange={(e) => setNewRuntime(e.target.value)} aria-label="Runtime">
                <option value="php">PHP</option>
                <option value="node">Node.js</option>
                <option value="python">Python</option>
                <option value="sh">Shell</option>
                <option value="rust">Rust</option>
              </select>
              <button type="button" className="skills-btn skills-btn--ghost" onClick={() => void createCustom()}>
                + New skill
              </button>
            </div>
          </div>

          <div className="skills-lab-layout">
            <aside className="skills-lab-list">
              <h4>
                {labScope === "global" ? "Global" : "Company"} skills ({scopedCustom.length})
              </h4>
              {labScope === "global" ? (
                <p className="muted skills-lab-list-hint">
                  50 agent tools (10× .sh .php .js .py .rs): parse, git, package, hash, validate… Select,
                  then Edit on the right.
                </p>
              ) : null}
              <div className="skills-lab-filter">
                <select
                  value={labFilter}
                  onChange={(e) => setLabFilter(e.target.value)}
                  aria-label="Filter by runtime"
                >
                  <option value="all">All runtimes</option>
                  <option value="python">Python</option>
                  <option value="php">PHP</option>
                  <option value="node">Node.js</option>
                  <option value="sh">Shell</option>
                  <option value="rust">Rust</option>
                </select>
              </div>
              {scopedCustom.length === 0 ? (
                <p className="muted">
                  No {labScope} skills yet.
                  {labScope === "company"
                    ? " Create one above, or switch to Global for starters."
                    : " Open Lab once to seed starters, or create one above."}
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
                        {isDirty ? <span className="skills-lab-dirty"> · Unsaved</span> : null}
                      </span>
                    </div>
                    <div className="skills-lab-editor-btns">
                      {!editMode ? (
                        <button type="button" className="skills-btn skills-btn--primary" onClick={startEdit}>
                          Edit
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="skills-btn skills-btn--primary"
                            disabled={saveBusy || !isDirty}
                            onClick={() => void saveCustom()}
                          >
                            {saveBusy ? "Saving…" : "Save"}
                          </button>
                          <button type="button" className="skills-btn skills-btn--ghost" onClick={discardEdit}>
                            Discard
                          </button>
                        </>
                      )}
                      <button type="button" className="skills-btn skills-btn--ghost" onClick={() => void deleteCustom()}>
                        Delete
                      </button>
                    </div>
                  </div>

                  {!editMode ? (
                    <p className="muted skills-lab-readonly-hint">
                      Viewing <strong>{selectedCustomId}</strong>. Press <strong>Edit</strong> to change the script,
                      SKILL.md, or display name.
                    </p>
                  ) : null}

                  <div className="skills-lab-editor-tabs" role="tablist">
                    {(
                      [
                        ["script", "Script"],
                        ["manifest", "SKILL.md"],
                        ["meta", "Details"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        className={`skills-lab-editor-tab${editorTab === id ? " is-active" : ""}`}
                        onClick={() => setEditorTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {editorTab === "script" ? (
                    <div className="skills-lab-editor-pane">
                      <label className="skills-domain-label">
                        Entry file name
                        <input
                          type="text"
                          value={entryName}
                          disabled={!editMode}
                          onChange={(e) => setEntryName(e.target.value)}
                          placeholder="main.py"
                        />
                      </label>
                      <label className="skills-domain-label">
                        Script source
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
                        Display name
                        <input
                          type="text"
                          value={displayName}
                          disabled={!editMode}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="My skill"
                        />
                      </label>
                      <label className="skills-domain-label">
                        Skill id
                        <input type="text" value={selectedCustomId} disabled readOnly />
                      </label>
                      <label className="skills-domain-label">
                        Scope
                        <input type="text" value={selectedScope} disabled readOnly />
                      </label>
                      <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
                        Id and scope cannot be changed after create. Display name is written into SKILL.md on
                        Save.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="skills-lab-empty-editor">
                  <p className="muted">
                    Select a skill from the list, then press <strong>Edit</strong> to change its script or
                    SKILL.md.
                  </p>
                  <p className="muted">Or create a new skill with the form above.</p>
                </div>
              )}
            </div>
          </div>

          <div className="skills-lab-test">
            <h4>Test runner</h4>
            <p className="skills-lab-test-lead">
              Type one line, then press <strong>Run</strong>. SoulCorp executes the script and shows a
              JSON result below.
            </p>

            <div className="skills-lab-format" aria-label="Command format explained">
              <p className="skills-lab-format-title">Command format</p>
              <div className="skills-lab-format-example">
                <code className="skills-lab-cmd">
                  <span className="skills-lab-tok skills-lab-tok--file">main.py</span>
                  <span className="skills-lab-tok skills-lab-tok--arg">notes.md</span>
                </code>
              </div>
              <ol className="skills-lab-format-steps">
                <li>
                  <strong className="skills-lab-tok--file">main.py</strong> — entry script of the
                  selected skill (or a file under <code>skills/scripts/</code>)
                </li>
                <li>
                  <strong className="skills-lab-tok--arg">notes.md</strong> — arguments (paths, URLs,
                  flags… space-separated; quote values with spaces)
                </li>
                <li>
                  <strong>Output</strong> — always JSON for the agent (<code>ok</code>,{" "}
                  <code>skill</code>, payload fields)
                </li>
              </ol>
              <div className="skills-lab-examples">
                <p className="skills-lab-format-title">Try these</p>
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
                        title={`Use example: ${cmd}`}
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
                  Cannot run this file: <strong>{missingForEntry.label}</strong> is not installed on
                  this machine. {missingForEntry.install_hint}
                </span>
                {missingForEntry.installable ? (
                  <button
                    type="button"
                    className="skills-btn skills-btn--ghost"
                    disabled={runtimeBusy === missingForEntry.id}
                    onClick={() => void installRuntime(missingForEntry.id)}
                  >
                    {runtimeBusy === missingForEntry.id ? "Installing…" : "Install now"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="skills-btn skills-btn--ghost"
                  onClick={() => setMainTab("runtimes")}
                >
                  Open Runtimes
                </button>
              </div>
            ) : null}

            <label className="skills-lab-test-label" htmlFor="skills-lab-command">
              Command line
            </label>
            <div className="skills-lab-test-row">
              <input
                id="skills-lab-command"
                type="text"
                value={testCommand}
                onChange={(e) => setTestCommand(e.target.value)}
                placeholder="main.py notes.md"
                aria-label="Test command line"
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
                {testBusy ? "Running…" : "Run"}
              </button>
            </div>

            {testResult ? (
              <div className="skills-code-block-wrap">
                <div className="skills-code-block-bar">
                  <span>
                    JSON output · {testResult.ok ? "success" : "failed"} ·{" "}
                    {testResult.runtime || "no runtime"} · {testResult.duration_ms}ms
                    {testResult.exit_code != null ? ` · exit ${testResult.exit_code}` : ""}
                  </span>
                  <button
                    type="button"
                    className="skills-btn skills-btn--ghost skills-btn--xs"
                    onClick={() =>
                      void navigator.clipboard?.writeText(JSON.stringify(testResult, null, 2))
                    }
                  >
                    Copy JSON
                  </button>
                </div>
                <pre className="skills-code-block skills-code-block--tall">
                  <code>{JSON.stringify(testResult, null, 2)}</code>
                </pre>
              </div>
            ) : (
              <p className="muted skills-lab-test-hint">
                After you press Run, the full JSON result appears here (including{" "}
                <code>stdout</code>, <code>stderr</code>, and <code>parsed_json</code> if the script
                printed JSON).
              </p>
            )}
          </div>
        </div>
      ) : null}

      {mainTab === "runtimes" ? (
        <div className="skills-runtimes">
          <div className="skills-lab-toolbar">
            <p className="muted" style={{ margin: 0 }}>
              Detected interpreters for script skills. Installs are user-space only (no sudo) under app toolchains.
            </p>
            <button type="button" className="skills-btn skills-btn--ghost" onClick={() => void loadRuntimes()}>
              Re-check
            </button>
          </div>
          <table className="skills-runtime-table">
            <thead>
              <tr>
                <th>Runtime</th>
                <th>Status</th>
                <th>Version</th>
                <th>Path</th>
                <th>Extensions</th>
                <th>Action</th>
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
                      {rt.available ? "Ready" : "Missing"}
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
                        {runtimeBusy === rt.id ? "Installing…" : "Install"}
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
                <span>Install log</span>
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
