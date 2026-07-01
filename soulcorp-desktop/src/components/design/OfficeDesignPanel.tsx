import { OFFICE_DESK_OPTIONS } from "../../data/designPresets";
import {
  applyOfficeThemePack,
  DEFAULT_OFFICE_THEME_PACK_ID,
  OFFICE_THEME_PACK_LIST,
} from "../../data/officeThemePacks";
import { useDesignStudioStore } from "../../stores/designStudioStore";
import { useGameStore } from "../../stores/gameStore";
import {
  DEFAULT_OFFICE_VISUAL,
  type OfficeDeskStyle,
  type OfficeVisualConfig,
} from "../../types/visualDesign";
import { normalizeOfficeVisual } from "../../utils/officeVisualNormalize";
import { ColorField } from "./ColorField";

export function OfficeDesignPanel() {
  const buildings = useGameStore((state) => state.buildings);
  const selectedBuildingId = useDesignStudioStore((state) => state.selectedBuildingId);
  const setSelectedBuildingId = useDesignStudioStore((state) => state.setSelectedBuildingId);
  const draft = useDesignStudioStore((state) => state.draft);
  const patchDraft = useDesignStudioStore((state) => state.patchDraft);

  const buildingId = selectedBuildingId ?? buildings[0]?.id ?? "hq";
  const config = normalizeOfficeVisual(draft.offices[buildingId] ?? DEFAULT_OFFICE_VISUAL, buildingId);

  const updateConfig = (patch: Partial<OfficeVisualConfig>) => {
    patchDraft({
      offices: {
        ...draft.offices,
        [buildingId]: { ...config, ...patch },
      },
    });
  };

  return (
    <section className="design-panel">
      <header>
        <h2>配色主題</h2>
        <p className="muted">Sims 式主題包 — 地板、牆身、accent 一鍵套用（預設：暖色初創）。</p>
      </header>

      <div className="design-style-grid">
        {OFFICE_THEME_PACK_LIST.map((pack) => (
          <button
            key={pack.id}
            type="button"
            className={`design-style-card${
              (config.theme_pack ?? DEFAULT_OFFICE_THEME_PACK_ID) === pack.id ? " active" : ""
            }`}
            onClick={() => updateConfig(applyOfficeThemePack(config, pack.id))}
          >
            <strong>{pack.labelZh}</strong>
            <span>{pack.description}</span>
          </button>
        ))}
      </div>

      <label className="field-label">
        Department office
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

      <div className="design-style-grid">
        {OFFICE_DESK_OPTIONS.map((style) => (
          <button
            key={style.id}
            type="button"
            className={`design-style-card${config.desk_style === style.id ? " active" : ""}`}
            onClick={() => updateConfig({ desk_style: style.id as OfficeDeskStyle })}
          >
            <strong>{style.label}</strong>
            <span>{style.description}</span>
          </button>
        ))}
      </div>

      <label className="field-label">
        Lighting mood
        <select
          value={config.lighting}
          onChange={(event) =>
            updateConfig({
              lighting: event.target.value as OfficeVisualConfig["lighting"],
            })
          }
        >
          <option value="warm">Warm</option>
          <option value="cool">Cool</option>
          <option value="natural">Natural</option>
        </select>
      </label>

      <ColorField
        label="Floor"
        value={config.floor_color}
        onChange={(floor_color) => updateConfig({ floor_color })}
      />
      <ColorField
        label="Walls"
        value={config.wall_color}
        onChange={(wall_color) => updateConfig({ wall_color })}
      />
      <ColorField
        label="Accent"
        value={config.accent_color}
        onChange={(accent_color) => updateConfig({ accent_color })}
      />

      <p className="muted design-panel-note">
        Plants, whiteboards, and lounge seating are placed via the floor plan editor and Build Mode
        furniture catalog — not legacy toggles.
      </p>
    </section>
  );
}