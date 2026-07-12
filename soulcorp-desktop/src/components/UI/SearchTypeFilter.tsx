import { useI18n } from "../../i18n/I18nProvider";

export interface SearchTypeFilterOption {
  value: string;
  label: string;
  labelKey?: string;
}

export interface SearchTypeFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchTypeFilterOption[];
  ariaLabel: string;
  label?: string;
  className?: string;
}

export function SearchTypeFilter({
  value,
  onChange,
  options,
  ariaLabel,
  label,
  className = "",
}: SearchTypeFilterProps) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("searchType.typeLabel");
  return (
    <label className={`search-type-filter${className ? ` ${className}` : ""}`}>
      <span className="search-type-filter-label">{resolvedLabel}</span>
      <select
        className="search-type-filter-select"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.labelKey ? t(option.labelKey) : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}