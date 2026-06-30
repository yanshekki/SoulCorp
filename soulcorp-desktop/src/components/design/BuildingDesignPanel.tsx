import { BUILDING_STYLE_OPTIONS } from "../../data/designPresets";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  DEFAULT_BUILDING_VISUAL,
  type BuildingStyle,
  type BuildingVisualConfig,
} from "../../types/visualDesign";
import { ColorField } from "./ColorField";

export function BuildingDesignPanel() {
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const setSelectedBuildingId = useDesignStudioStore((state) => state.setSelectedBuildingId);
  const draft = useDesignStudioStore((state) => state.draft);
  const patchDraft = useDesignStudioStore((state) => state.patchDraft);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const building = buildings.find((item) => item.id === buildingId);
  const config = draft.buildings[buildingId] ?? {
    ...DEFAULT_BUILDING_VISUAL,
    color: building?.color ?? DEFAULT_BUILDING_VISUAL.color,
    roof_color: building?.roofColor ?? DEFAULT_BUILDING_VISUAL.roof_color,
    accent_color: building?.accentColor ?? DEFAULT_BUILDING_VISUAL.accent_color,
    size: building?.size ?? DEFAULT_BUILDING_VISUAL.size,
    signage: building?.name ?? "",
  };

  const updateConfig = (patch: Partial<BuildingVisualConfig>) => {
    patchDraft({
      buildings: {
        ...draft.buildings,
        [buildingId]: { ...config, ...patch },
      },
    });
  };

  return (
    <section className="design-panel">
      <header>
        <h2>Building designer</h2>
        <p className="muted">Customize each department tower — facade, roof, signage, and volume.</p>
      </header>

      <label className="field-label">
        Department building
        <select
          value={buildingId}
          onChange={(event) => setSelectedBuildingId(event.target.value)}
        >
          {buildings.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.department}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        Signage / display name
        <input
          type="text"
          value={config.signage}
          onChange={(event) => updateConfig({ signage: event.target.value })}
          maxLength={48}
        />
      </label>

      <div className="design-style-grid">
        {BUILDING_STYLE_OPTIONS.map((style) => (
          <button
            key={style.id}
            type="button"
            className={`design-style-card${config.style === style.id ? " active" : ""}`}
            onClick={() => updateConfig({ style: style.id as BuildingStyle })}
          >
            <strong>{style.label}</strong>
            <span>{style.description}</span>
          </button>
        ))}
      </div>

      <ColorField label="Facade" value={config.color} onChange={(color) => updateConfig({ color })} />
      <ColorField
        label="Roof"
        value={config.roof_color}
        onChange={(roof_color) => updateConfig({ roof_color })}
      />
      <ColorField
        label="Accent / signage"
        value={config.accent_color}
        onChange={(accent_color) => updateConfig({ accent_color })}
      />

      <div className="design-slider-grid">
        {(["Width", "Height", "Depth"] as const).map((label, index) => (
          <label key={label} className="field-label">
            {label}
            <input
              type="range"
              min={2}
              max={6}
              step={0.1}
              value={config.size[index]}
              onChange={(event) => {
                const next = [...config.size] as [number, number, number];
                next[index] = Number(event.target.value);
                updateConfig({ size: next });
              }}
            />
            <span className="muted">{config.size[index].toFixed(1)}m</span>
          </label>
        ))}
      </div>
    </section>
  );
}