import { AGENT_PRESET_LOOKS } from "../../data/designPresets";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  DEFAULT_AGENT_VISUAL,
  type AgentVisualConfig,
  type DesignHairStyle,
} from "../../types/visualDesign";
import { generateAgentAppearance } from "../../utils/agentAppearance";
import { appearanceFromVisualConfig } from "../../utils/applyVisualDesign";
import { ColorField } from "./ColorField";

export function AgentDesignPanel() {
  const agents = useGameStore((state) => state.agents);
  const agentRecords = useGameStore((state) => state.agentRecords);
  const selectedAgentId = useDesignStudioStore((state) => state.selectedAgentId);
  const setSelectedAgentId = useDesignStudioStore((state) => state.setSelectedAgentId);
  const draft = useDesignStudioStore((state) => state.draft);
  const patchDraft = useDesignStudioStore((state) => state.patchDraft);

  const roster = agentRecords.length > 0
    ? agentRecords.map((record) => ({ id: record.id, name: record.name, department: record.department }))
    : agents.map((agent) => ({ id: agent.id, name: agent.name, department: agent.department }));

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
        <h2>Agent appearance</h2>
        <p className="muted">Hire or seed agents first, then customize their look here.</p>
      </section>
    );
  }

  return (
    <section className="design-panel">
      <header>
        <h2>Agent appearance</h2>
        <p className="muted">Design how each employee appears in the 3D campus.</p>
      </header>

      <label className="field-label">
        Employee
        <select value={agentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
          {roster.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.department}
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
            <strong>{preset.label}</strong>
          </button>
        ))}
      </div>

      <label className="field-label">
        Hair style
        <select
          value={config.hair_style}
          onChange={(event) =>
            updateConfig({ hair_style: event.target.value as DesignHairStyle })
          }
        >
          <option value="short">Short</option>
          <option value="bob">Bob</option>
          <option value="spiky">Spiky</option>
          <option value="long">Long</option>
        </select>
      </label>

      <ColorField
        label="Skin tone"
        value={config.skin_color}
        onChange={(skin_color) => updateConfig({ skin_color })}
      />
      <ColorField
        label="Shirt"
        value={config.shirt_color}
        onChange={(shirt_color) => updateConfig({ shirt_color })}
      />
      <ColorField
        label="Pants"
        value={config.pants_color}
        onChange={(pants_color) => updateConfig({ pants_color })}
      />
      <ColorField
        label="Hair"
        value={config.hair_color}
        onChange={(hair_color) => updateConfig({ hair_color })}
      />
      <ColorField
        label="Shoes"
        value={config.shoe_color}
        onChange={(shoe_color) => updateConfig({ shoe_color })}
      />

      <div className="design-slider-grid">
        <label className="field-label">
          Height
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
          Build
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
        Randomize look
      </button>

      <p className="muted design-swatch-preview">
        Preview shirt: {appearanceFromVisualConfig(agentId, config).shirtColor}
      </p>
    </section>
  );
}