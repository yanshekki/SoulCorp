import type { ReactNode } from "react";
import { SearchField } from "./SearchField";
import { SearchTypeFilter, type SearchTypeFilterProps } from "./SearchTypeFilter";

interface SearchableListToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  matchCount?: number;
  totalCount?: number;
  loading?: boolean;
  typeFilter?: Omit<SearchTypeFilterProps, "className">;
  children?: ReactNode;
  className?: string;
}

export function SearchableListToolbar({
  query,
  onQueryChange,
  placeholder,
  ariaLabel,
  matchCount,
  totalCount,
  loading,
  typeFilter,
  children,
  className = "",
}: SearchableListToolbarProps) {
  return (
    <div className={`searchable-list-toolbar${className ? ` ${className}` : ""}`}>
      <div className="searchable-list-toolbar-primary">
        <SearchField
          value={query}
          onChange={onQueryChange}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          matchCount={matchCount}
          totalCount={totalCount}
          loading={loading}
          size="compact"
        />
        {typeFilter ? <SearchTypeFilter {...typeFilter} /> : null}
      </div>
      {children ? <div className="searchable-list-toolbar-actions">{children}</div> : null}
    </div>
  );
}