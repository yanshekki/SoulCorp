import type { RuntimeCatalog } from "../../../types/game";
import { AI_PROVIDER_DEFAULT } from "../../../data/aiProviders";
import { filterCatalogByLayer, groupCatalogEntries } from "../../../utils/agentRuntimeCatalog";
import { useI18n } from "../../../i18n/I18nProvider";

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
  inheritLabel,
  includeInherit = true,
  disabled = false,
  onChange,
}: MeetingBrainPickerProps) {
  const { t } = useI18n();
  const resolvedInherit = inheritLabel ?? t("brain.inheritDefault");
  const grouped = catalog ? groupCatalogEntries(filterCatalogByLayer(catalog, "meeting")) : [];

  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {includeInherit ? <option value={AI_PROVIDER_DEFAULT}>{resolvedInherit}</option> : null}
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