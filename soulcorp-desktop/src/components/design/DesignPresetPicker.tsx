import { DESIGN_PRESETS } from "../../data/designPresets";

interface DesignPresetPickerProps {
  onSelect: (presetId: string) => void;
  compact?: boolean;
}

export function DesignPresetPicker({ onSelect, compact = false }: DesignPresetPickerProps) {
  return (
    <section className={`design-preset-picker${compact ? " compact" : ""}`}>
      <h3>{compact ? "Quick presets" : "Preset gallery"}</h3>
      <div className="design-preset-grid">
        {DESIGN_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="design-preset-card"
            onClick={() => onSelect(preset.id)}
          >
            <span className="design-preset-icon" aria-hidden="true">
              {preset.preview}
            </span>
            <strong>{preset.title}</strong>
            {!compact ? <span>{preset.description}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}