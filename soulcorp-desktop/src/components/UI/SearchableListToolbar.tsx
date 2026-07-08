import type { ReactNode } from "react";
import { SearchField } from "./SearchField";

interface SearchableListToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  matchCount?: number;
  totalCount?: number;
  loading?: boolean;
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
  children,
  className = "",
}: SearchableListToolbarProps) {
  return (
    <div className={`searchable-list-toolbar${className ? ` ${className}` : ""}`}>
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
      {children ? <div className="searchable-list-toolbar-actions">{children}</div> : null}
    </div>
  );
}