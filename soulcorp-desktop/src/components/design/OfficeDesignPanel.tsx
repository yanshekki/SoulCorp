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
import { useI18n } from "../../i18n/I18nProvider";

export function OfficeDesignPanel() {
  const { t } = useI18n();
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
        <h2>{t("design.colorThemes")}</h2>
<p className="muted">{t("design.colorThemesDesc")}</p>
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
            <strong>{t(`design.theme.${pack.id}`)}</strong>
            <span>{t(`design.theme.${pack.id}.desc`)}</span>
          </button>
        ))}
      </div>

      <label className="field-label">
        {t("design.deptOffice")}
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
            <strong>{t(`design.deskStyle.${style.id}`)}</strong>
            <span>{t(`design.deskStyle.${style.id}.desc`)}</span>
          </button>
        ))}
      </div>

      <label className="field-label">
        {t("design.lightingMood")}
        <select
          value={config.lighting}
          onChange={(event) =>
            updateConfig({
              lighting: event.target.value as OfficeVisualConfig["lighting"],
            })
          }
        >
          <option value="warm">{t("design.palette.warm")}</option>
          <option value="cool">{t("design.palette.cool")}</option>
          <option value="natural">{t("design.palette.natural")}</option>
        </select>
      </label>

      <ColorField
        label={t("design.floor")}
        value={config.floor_color}
        onChange={(floor_color) => updateConfig({ floor_color })}
      />
      <ColorField
        label={t("design.walls")}
        value={config.wall_color}
        onChange={(wall_color) => updateConfig({ wall_color })}
      />
      <ColorField
        label={t("design.accent")}
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