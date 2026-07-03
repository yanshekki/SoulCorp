import { useEffect, useMemo, useState } from "react";
import type { AgentTokenWallet, DepartmentTokenWallet, TokenBudgetPeriodType } from "../../types/game";

const PERIOD_OPTIONS: { value: TokenBudgetPeriodType; label: string }[] = [
  { value: "none", label: "No period limit" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom days" },
];

function formatTokens(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function periodDurationDays(periodType: TokenBudgetPeriodType, customDays: number): number | null {
  switch (periodType) {
    case "weekly":
      return 7;
    case "monthly":
      return 30;
    case "quarterly":
      return 90;
    case "yearly":
      return 365;
    case "custom":
      return Math.max(1, customDays);
    default:
      return null;
  }
}

function formatNextReset(
  startedAt: string | null | undefined,
  periodType: TokenBudgetPeriodType,
  customDays: number,
): string | null {
  const durationDays = periodDurationDays(periodType, customDays);
  if (!startedAt || !durationDays) {
    return null;
  }
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) {
    return null;
  }
  const resetAt = started + durationDays * 24 * 60 * 60 * 1000;
  return new Date(resetAt).toLocaleString();
}

interface AgentTokenBudgetEditorProps {
  wallet?: DepartmentTokenWallet | AgentTokenWallet;
  saving?: boolean;
  onSave: (policy: {
    period_limit: number;
    period_type: TokenBudgetPeriodType;
    period_days?: number;
  }) => void;
}

export function AgentTokenBudgetEditor({ wallet, saving, onSave }: AgentTokenBudgetEditorProps) {
  const [limit, setLimit] = useState(0);
  const [periodType, setPeriodType] = useState<TokenBudgetPeriodType>("none");
  const [periodDays, setPeriodDays] = useState(30);

  useEffect(() => {
    setLimit(wallet?.period_limit ?? 0);
    setPeriodType(wallet?.period_type ?? "none");
    setPeriodDays(wallet?.period_days ?? 30);
  }, [wallet?.period_limit, wallet?.period_type, wallet?.period_days, wallet?.period_spent]);

  const nextReset = useMemo(
    () => formatNextReset(wallet?.period_started_at, periodType, periodDays),
    [wallet?.period_started_at, periodType, periodDays],
  );

  const effectiveType = limit > 0 ? periodType : "none";

  return (
    <div className="agents-token-budget">
      <div className="agents-token-stats">
        <span>Balance {formatTokens(wallet?.balance ?? 0)}</span>
        <span>
          Period {formatTokens(wallet?.period_spent ?? 0)} /{" "}
          {(wallet?.period_limit ?? 0) > 0 ? formatTokens(wallet?.period_limit ?? 0) : "∞"}
        </span>
        <span>Lifetime {formatTokens(wallet?.spent ?? 0)}</span>
        {nextReset && effectiveType !== "none" ? (
          <span className="muted">Resets {nextReset}</span>
        ) : null}
      </div>

      <div className="agents-token-budget-controls">
        <label className="field-label">
          Period token limit (0 = unlimited)
          <input
            type="number"
            min={0}
            step={100}
            value={limit}
            onChange={(event) => setLimit(Math.max(0, Number(event.target.value)))}
          />
        </label>

        <label className="field-label">
          Reset cycle
          <select
            value={effectiveType}
            disabled={limit === 0}
            onChange={(event) => setPeriodType(event.target.value as TokenBudgetPeriodType)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {effectiveType === "custom" ? (
          <label className="field-label">
            Custom period (days)
            <input
              type="number"
              min={1}
              max={3650}
              value={periodDays}
              onChange={(event) => setPeriodDays(Math.max(1, Number(event.target.value)))}
            />
          </label>
        ) : null}

        <button
          type="button"
          className="secondary-action"
          disabled={saving}
          onClick={() =>
            onSave({
              period_limit: limit,
              period_type: limit > 0 ? effectiveType : "none",
              period_days: effectiveType === "custom" ? periodDays : undefined,
            })
          }
        >
          {saving ? "Saving…" : "Save token budget"}
        </button>
      </div>
    </div>
  );
}