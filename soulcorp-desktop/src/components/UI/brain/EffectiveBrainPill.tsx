import { useI18n } from "../../../i18n/I18nProvider";

interface EffectiveBrainPillProps {
  label: string;
  transport?: "api" | "subprocess" | "builtin";
}

const TRANSPORT_KEYS: Record<NonNullable<EffectiveBrainPillProps["transport"]>, string> = {
  api: "transport.api",
  subprocess: "transport.subprocess",
  builtin: "transport.builtin",
};

export function EffectiveBrainPill({ label, transport }: EffectiveBrainPillProps) {
  const { t } = useI18n();
  const transportLabel = transport ? t(TRANSPORT_KEYS[transport]) : null;

  return (
    <span className="agents-effective-pill">
      {label}
      {transportLabel ? <span className="brain-pill-transport"> · {transportLabel}</span> : null}
    </span>
  );
}
