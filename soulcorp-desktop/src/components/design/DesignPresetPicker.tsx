import { DESIGN_PRESETS } from "../../data/designPresets";

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
  return (
    <section className={`design-preset-picker${compact ? " compact" : ""}`}>
      <h3>{compact ? "Quick presets" : "Preset gallery"}</h3>
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
                <strong>{preset.title}</strong>
                {isSelected ? <span className="design-preset-selected-badge">Selected</span> : null}
              </div>
              {!compact ? <span className="design-preset-description">{preset.description}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}