import { useDesignStudioStore } from "../../stores/designStudioStore";
import type { CampusThemeConfig } from "../../types/visualDesign";
import { ColorField } from "./ColorField";
import { useI18n } from "../../i18n/I18nProvider";

export function CampusDesignPanel() {
  const { t } = useI18n();
  const draft = useDesignStudioStore((state) => state.draft);
  const patchDraft = useDesignStudioStore((state) => state.patchDraft);
  const campus = draft.campus;

  const updateCampus = (patch: Partial<CampusThemeConfig>) => {
    patchDraft({ campus: { ...campus, ...patch } });
  };

  return (
    <section className="design-panel">
      <header>
        <h2>{t("design.campusTheme")}</h2>
        <p className="muted">{t("design.campusThemeDesc")}</p>
      </header>

      <ColorField
        label={t("design.skyTop")}
        value={campus.sky_top}
        onChange={(sky_top) => updateCampus({ sky_top })}
      />
      <ColorField
        label={t("design.skyHorizon")}
        value={campus.sky_bottom}
        onChange={(sky_bottom) => updateCampus({ sky_bottom })}
      />
      <ColorField
        label={t("design.groundPrimary")}
        value={campus.ground_primary}
        onChange={(ground_primary) => updateCampus({ ground_primary })}
      />
      <ColorField
        label={t("design.groundSecondary")}
        value={campus.ground_secondary}
        onChange={(ground_secondary) => updateCampus({ ground_secondary })}
      />

      <label className="field-label">
        Ambient intensity
        <input
          type="range"
          min={0.4}
          max={1.2}
          step={0.05}
          value={campus.ambient_intensity}
          onChange={(event) =>
            updateCampus({ ambient_intensity: Number(event.target.value) })
          }
        />
        <span className="muted">{campus.ambient_intensity.toFixed(2)}</span>
      </label>
    </section>
  );
}