import type { RuntimeCatalog } from "../../../types/game";
import { AI_PROVIDER_DEFAULT } from "../../../data/aiProviders";
import { filterCatalogByLayer, groupCatalogEntries } from "../../../utils/agentRuntimeCatalog";

interface MeetingBrainPickerProps {
  catalog: RuntimeCatalog | null;
  value: string;
  inheritLabel?: string;
  includeInherit?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function MeetingBrainPicker({
  catalog,
  value,
  inheritLabel = "Inherit default",
  includeInherit = true,
  disabled = false,
  onChange,
}: MeetingBrainPickerProps) {
  const grouped = catalog ? groupCatalogEntries(filterCatalogByLayer(catalog, "meeting")) : [];

  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {includeInherit ? <option value={AI_PROVIDER_DEFAULT}>{inheritLabel}</option> : null}
      {grouped.map((group) => (
        <optgroup key={group.category} label={group.label}>
          {group.runtimes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}