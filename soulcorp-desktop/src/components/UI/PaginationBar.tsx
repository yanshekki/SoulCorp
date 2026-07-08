interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function PaginationBar({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  label,
  className = "",
}: PaginationBarProps) {
  if (totalPages <= 1) {
    return null;
  }

  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  return (
    <div
      className={`pagination-bar${className ? ` ${className}` : ""}`}
      role="navigation"
      aria-label={label ? `${label} pagination` : "Pagination"}
    >
      <button
        type="button"
        disabled={disabled || safePage <= 0}
        onClick={() => onPageChange(Math.max(0, safePage - 1))}
      >
        Previous
      </button>
      <span className="pagination-bar-status muted">
        {label ? `${label} · ` : ""}
        Page {safePage + 1} of {totalPages}
      </span>
      <button
        type="button"
        disabled={disabled || safePage >= totalPages - 1}
        onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
      >
        Next
      </button>
    </div>
  );
}