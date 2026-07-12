import { useId } from "react";
import { SearchTypeFilter, type SearchTypeFilterProps } from "./SearchTypeFilter";
import { useI18n } from "../../i18n/I18nProvider";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  loading?: boolean;
  matchCount?: number;
  totalCount?: number;
  size?: "compact" | "default";
  className?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  typeFilter?: Omit<SearchTypeFilterProps, "className">;
}

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  loading = false,
  matchCount,
  totalCount,
  size = "default",
  className = "",
  onKeyDown,
  typeFilter,
}: SearchFieldProps) {
  const { t } = useI18n();
  const inputId = useId();
  const resolvedPlaceholder = placeholder ?? t("search.placeholder");
  const hasQuery = value.trim().length > 0;
  const showMeta = hasQuery && (loading || matchCount !== undefined || totalCount !== undefined);

  let metaText: string | null = null;
  if (loading) {
    metaText = t("search.searching");
  } else if (hasQuery && matchCount !== undefined && totalCount !== undefined) {
    metaText = t("search.matchOf", { match: matchCount, total: totalCount });
  } else if (hasQuery && matchCount !== undefined) {
    metaText =
      matchCount === 1 ? t("search.matchOne") : t("search.matchMany", { n: matchCount });
  }

  return (
    <div
      className={`search-field search-field--${size}${typeFilter ? " search-field--with-type" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="search-field-row">
      <div className="search-field-input-wrap">
        <span className="search-field-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          id={inputId}
          type="search"
          className="search-field-input"
          value={value}
          placeholder={resolvedPlaceholder}
          aria-label={ariaLabel}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {loading ? <span className="search-field-spinner" aria-hidden="true" /> : null}
        {hasQuery ? (
          <button
            type="button"
            className="search-field-clear"
            aria-label={t("search.clear")}
            onClick={() => onChange("")}
          >
            ×
          </button>
        ) : null}
      </div>
      {typeFilter ? <SearchTypeFilter {...typeFilter} /> : null}
      </div>
      {showMeta && metaText ? (
        <span className="search-field-meta muted">{metaText}</span>
      ) : null}
    </div>
  );
}