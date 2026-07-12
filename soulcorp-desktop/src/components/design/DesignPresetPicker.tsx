import { DESIGN_PRESETS } from "../../data/designPresets";
import { useI18n } from "../../i18n/I18nProvider";

interface DesignPresetPickerProps {
  onSelect: (presetId: string) => void;
  selectedId?: string | null;
  compact?: boolean;
}

export function DesignPresetPicker({
  onSelect,
  selectedId = null,
  compact = false,
}: DesignPresetPickerProps) {
  const { t } = useI18n();
  return (
    <section className={`design-preset-picker${compact ? " compact" : ""}`}>
      <h3>{compact ? t("design.presets.quick") : t("design.presets.gallery")}</h3>
      <div className={`design-preset-grid${compact ? " compact" : ""}`}>
        {DESIGN_PRESETS.map((preset) => {
          const isSelected = selectedId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`design-preset-card${isSelected ? " selected" : ""}`}
              data-preset={preset.id}
              aria-pressed={isSelected}
              onClick={() => onSelect(preset.id)}
            >
              <span className="design-preset-icon" aria-hidden="true">
                {preset.preview}
              </span>
              <div className="design-preset-card-body">
                <strong>{t(`design.preset.${preset.id}.title`)}</strong>
                {isSelected ? <span className="design-preset-selected-badge">{t("design.presets.selected")}</span> : null}
              </div>
              {!compact ? <span className="design-preset-description">{t(`design.preset.${preset.id}.desc`)}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}