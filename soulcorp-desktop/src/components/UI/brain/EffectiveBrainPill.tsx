interface EffectiveBrainPillProps {
  label: string;
  transport?: "api" | "subprocess" | "builtin";
}

export function EffectiveBrainPill({ label, transport }: EffectiveBrainPillProps) {
  const transportLabel =
    transport === "api" ? "API" : transport === "subprocess" ? "CLI" : transport === "builtin" ? "LLM" : null;

  return (
    <span className="agents-effective-pill">
      {label}
      {transportLabel ? <span className="brain-pill-transport"> · {transportLabel}</span> : null}
    </span>
  );
}