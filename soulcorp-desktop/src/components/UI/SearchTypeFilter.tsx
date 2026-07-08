export interface SearchTypeFilterOption {
  value: string;
  label: string;
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
  label = "Type",
  className = "",
}: SearchTypeFilterProps) {
  return (
    <label className={`search-type-filter${className ? ` ${className}` : ""}`}>
      <span className="search-type-filter-label">{label}</span>
      <select
        className="search-type-filter-select"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}