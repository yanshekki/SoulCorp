import { useI18n } from "../../i18n/I18nProvider";

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
  const { t } = useI18n();
  if (totalPages <= 1) {
    return null;
  }

  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  return (
    <div
      className={`pagination-bar${className ? ` ${className}` : ""}`}
      role="navigation"
      aria-label={label ? t("pagination.ariaLabeled", { label }) : t("pagination.aria")}
    >
      <button
        type="button"
        disabled={disabled || safePage <= 0}
        onClick={() => onPageChange(Math.max(0, safePage - 1))}
      >
        {t("common.previous")}
      </button>
      <span className="pagination-bar-status muted">
        {label
          ? t("pagination.pageOfLabeled", { label, current: safePage + 1, total: totalPages })
          : t("pagination.pageOf", { current: safePage + 1, total: totalPages })}
      </span>
      <button
        type="button"
        disabled={disabled || safePage >= totalPages - 1}
        onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
      >
        {t("common.next")}
      </button>
    </div>
  );
}
