import { AGENT_PRESET_LOOKS } from "../../data/designPresets";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import { formatAgentOptionLabel } from "../../utils/agentLabel";
import {
  DEFAULT_AGENT_VISUAL,
  type AgentVisualConfig,
  type DesignHairStyle,
} from "../../types/visualDesign";
import { generateAgentAppearance } from "../../utils/agentAppearance";
import { appearanceFromVisualConfig } from "../../utils/applyVisualDesign";
import { ColorField } from "./ColorField";
import { useI18n } from "../../i18n/I18nProvider";

export function AgentDesignPanel() {
  const { t } = useI18n();
  const agents = useGameStore((state) => state.agents);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const selectedAgentId = useDesignStudioStore((state) => state.selectedAgentId);
  const setSelectedAgentId = useDesignStudioStore((state) => state.setSelectedAgentId);
  const draft = useDesignStudioStore((state) => state.draft);
  const patchDraft = useDesignStudioStore((state) => state.patchDraft);

  const roster = agentRecords.length > 0
    ? agentRecords.map((record) => ({
        id: record.id,
        name: record.name,
        role: record.role,
        department: record.department,
      }))
    : agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        department: agent.department,
      }));

  const agentId = selectedAgentId ?? roster[0]?.id ?? null;
  const agent = roster.find((item) => item.id === agentId);
  const generated = agentId ? generateAgentAppearance(agentId) : null;
  const config = agentId
    ? (draft.agents[agentId] ?? {
        ...DEFAULT_AGENT_VISUAL,
        skin_color: generated?.skinColor ?? DEFAULT_AGENT_VISUAL.skin_color,
        shirt_color: generated?.shirtColor ?? DEFAULT_AGENT_VISUAL.shirt_color,
        pants_color: generated?.pantsColor ?? DEFAULT_AGENT_VISUAL.pants_color,
        hair_color: generated?.hairColor ?? DEFAULT_AGENT_VISUAL.hair_color,
        hair_style: (generated?.hairStyle ?? "short") as DesignHairStyle,
        height: generated?.height ?? 1,
        build: generated?.build ?? 1,
      })
    : DEFAULT_AGENT_VISUAL;

  const updateConfig = (patch: Partial<AgentVisualConfig>) => {
    if (!agentId) {
      return;
    }
    patchDraft({
      agents: {
        ...draft.agents,
        [agentId]: { ...config, ...patch },
      },
    });
  };

  if (!agentId || !agent) {
    return (
      <section className="design-panel">
        <h2>{t("design.agentAppearance")}</h2>
        <p className="muted">{t("design.agentAppearanceEmpty")}</p>
      </section>
    );
  }

  return (
    <section className="design-panel">
      <header>
        <h2>{t("design.agentAppearance")}</h2>
        <p className="muted">{t("design.agentAppearanceDesc")}</p>
      </header>

      <label className="field-label">
        {t("design.employee")}
        <select value={agentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
          {roster.map((item) => (
            <option key={item.id} value={item.id}>
              {formatAgentOptionLabel(item)}
            </option>
          ))}
        </select>
      </label>

      <div className="design-preset-grid compact">
        {AGENT_PRESET_LOOKS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="design-preset-card"
            onClick={() => updateConfig({ ...config, ...preset.config })}
          >
            <strong>{t(`design.look.${preset.id}`)}</strong>
          </button>
        ))}
      </div>

      <label className="field-label">
        {t("design.hairStyle")}
        <select
          value={config.hair_style}
          onChange={(event) =>
            updateConfig({ hair_style: event.target.value as DesignHairStyle })
          }
        >
          <option value="short">{t("design.hair.short")}</option>
          <option value="bob">{t("design.hair.bob")}</option>
          <option value="spiky">{t("design.hair.spiky")}</option>
          <option value="long">{t("design.hair.long")}</option>
        </select>
      </label>

      <ColorField
        label={t("design.skinTone")}
        value={config.skin_color}
        onChange={(skin_color) => updateConfig({ skin_color })}
      />
      <ColorField
        label={t("design.shirt")}
        value={config.shirt_color}
        onChange={(shirt_color) => updateConfig({ shirt_color })}
      />
      <ColorField
        label={t("design.pants")}
        value={config.pants_color}
        onChange={(pants_color) => updateConfig({ pants_color })}
      />
      <ColorField
        label={t("design.hair")}
        value={config.hair_color}
        onChange={(hair_color) => updateConfig({ hair_color })}
      />
      <ColorField
        label={t("design.shoes")}
        value={config.shoe_color}
        onChange={(shoe_color) => updateConfig({ shoe_color })}
      />

      <div className="design-slider-grid">
        <label className="field-label">
          {t("design.height")}
          <input
            type="range"
            min={0.85}
            max={1.15}
            step={0.01}
            value={config.height}
            onChange={(event) => updateConfig({ height: Number(event.target.value) })}
          />
        </label>
        <label className="field-label">
          {t("design.build")}
          <input
            type="range"
            min={0.8}
            max={1.2}
            step={0.01}
            value={config.build}
            onChange={(event) => updateConfig({ build: Number(event.target.value) })}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => {
          const random = generateAgentAppearance(`${agentId}-${Date.now()}`);
          updateConfig({
            skin_color: random.skinColor,
            shirt_color: random.shirtColor,
            pants_color: random.pantsColor,
            hair_color: random.hairColor,
            hair_style: random.hairStyle,
            height: random.height,
            build: random.build,
          });
        }}
      >
        {t("world.randomizeLook")}
      </button>

      <p className="muted design-swatch-preview">
        Preview shirt: {appearanceFromVisualConfig(agentId, config).shirtColor}
      </p>
    </section>
  );
}