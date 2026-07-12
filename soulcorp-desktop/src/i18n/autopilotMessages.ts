import type { TranslationParams } from "./types";

type TFn = (key: string, params?: TranslationParams) => string;

const PHASE_IDS = [
  "bootstrap",
  "briefing",
  "aligning",
  "planning",
  "documenting",
  "scheduling",
  "executing",
  "reviewing",
  "delivered",
  "growing",
  "stalled",
] as const;

export function autopilotPhaseLabel(t: TFn, phase: string, fallback?: string): string {
  const id = phase.trim().toLowerCase();
  const key = `autopilot.phase.${id}`;
  const value = t(key);
  return value === key ? (fallback ?? phase) : value;
}

export function autopilotStallReason(t: TFn, reason: string | null | undefined): string | null {
  if (!reason) return null;
  const ticks = reason.match(/(\d+)\s+worker ticks/i);
  if (ticks) {
    return t("autopilot.stall.noProgress", { n: ticks[1] });
  }
  if (/no progress/i.test(reason)) {
    const n = reason.match(/(\d+)/)?.[1] ?? "0";
    return t("autopilot.stall.noProgress", { n });
  }
  return reason;
}

export function autopilotNextAction(t: TFn, nextAction: string, phase?: string): string {
  const msg = nextAction.trim();
  if (!msg) return msg;

  if (/autopilot paused/i.test(msg) || /resume in command center/i.test(msg)) {
    return t("autopilot.next.paused");
  }
  if (/enable background worker/i.test(msg)) {
    return t("autopilot.next.workerOff");
  }
  if (/complete onboarding/i.test(msg)) {
    return t("autopilot.next.bootstrap");
  }
  if (/co-ceo will issue/i.test(msg) || /strategic directive/i.test(msg)) {
    return t("autopilot.next.briefing");
  }
  if (/automated meeting in progress/i.test(msg)) {
    return t("autopilot.next.aligning");
  }
  if (/routing directives/i.test(msg)) {
    return t("autopilot.next.planning");
  }
  if (/creating workspace brief/i.test(msg)) {
    return t("autopilot.next.documenting");
  }
  if (/assigning tasks/i.test(msg)) {
    return t("autopilot.next.scheduling");
  }
  if (/agents executing/i.test(msg)) {
    return t("autopilot.next.executing");
  }
  if (/awaiting your approval/i.test(msg)) {
    return t("autopilot.next.reviewingGate");
  }
  if (/pm reviewing deliverables/i.test(msg)) {
    return t("autopilot.next.reviewingPm");
  }
  if (/cycle complete/i.test(msg)) {
    return t("autopilot.next.delivered");
  }
  if (/marketplace gigs/i.test(msg)) {
    return t("autopilot.next.growing");
  }
  if (/pipeline stalled/i.test(msg) || /forcing orchestrator/i.test(msg)) {
    return t("autopilot.next.stalled");
  }

  // Fallback by phase id when BE copy drifts
  if (phase) {
    const id = phase.toLowerCase();
    if ((PHASE_IDS as readonly string[]).includes(id)) {
      const key = `autopilot.next.${id}`;
      const value = t(key);
      if (value !== key) return value;
    }
  }
  return msg;
}

export function workerLogLine(t: TFn, line: string): string {
  const text = line.trim();
  if (/Worker tick skipped:\s*no active company/i.test(text)) {
    return t("worker.log.noCompany");
  }
  if (/Worker tick skipped:\s*scrum worker disabled/i.test(text)) {
    return t("worker.log.disabled");
  }
  if (/Worker tick skipped:\s*execution paused/i.test(text)) {
    return t("worker.log.executionPaused");
  }
  const llm = text.match(/API key is set for '([^']+)'/i) || text.match(/API key is set for "([^"]+)"/i);
  if (/LLM execution paused until API key/i.test(text) && llm) {
    return t("worker.log.llmPaused", { provider: llm[1] });
  }
  if (/Orchestrator skipped:\s*execution paused/i.test(text)) {
    return t("orchestrator.log.executionPaused");
  }
  if (/PM reject cap reached/i.test(text)) {
    return t("worker.log.pmRejectCap");
  }
  if (/PM review failed.*auto-approved/i.test(text)) {
    return t("worker.log.pmReviewFailApproved");
  }
  if (/PM approved /i.test(text)) {
    return t("worker.log.pmApproved");
  }
  const rev = text.match(/PM rejected .+ \(revision (\d+)\/(\d+)\)/i);
  if (rev) {
    return t("worker.log.pmRejected", { n: rev[1], max: rev[2] });
  }
  return line;
}

export function interventionActionLabel(t: TFn, action: string): string {
  const normalized = action.trim().toLowerCase().replace(/\s+/g, "_");
  const aliases: Record<string, string> = {
    follow_up: "follow_up",
    followup: "follow_up",
    dismiss: "dismiss",
    approve: "approve",
    reject: "reject",
    comment: "comment",
    pause: "pause",
    resume: "resume",
  };
  const id = aliases[normalized] ?? normalized;
  const key = `autopilot.action.${id}`;
  const value = t(key);
  return value === key ? action : value;
}

export function interventionKindLabel(t: TFn, kind: string): string {
  const normalized = kind.trim().toLowerCase().replace(/\s+/g, "_");
  const key = `autopilot.kind.${normalized}`;
  const value = t(key);
  return value === key ? kind : value;
}
