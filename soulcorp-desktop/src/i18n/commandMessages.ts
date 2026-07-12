import type { TranslationParams } from "./types";
import type { AutomationReadinessItem, CommandCenterAlert } from "../types/game";

type TFn = (key: string, params?: TranslationParams) => string;

function firstNumber(text: string): string | undefined {
  const match = text.match(/(\d+)/);
  return match?.[1];
}

export function readinessLabel(t: TFn, item: AutomationReadinessItem): string {
  const key = `command.readiness.${item.id}`;
  const value = t(key);
  return value === key ? item.label : value;
}

export function readinessDetail(t: TFn, item: AutomationReadinessItem): string {
  switch (item.id) {
    case "company":
      return item.ok ? t("command.readiness.company.ok") : t("command.readiness.company.fail");
    case "project": {
      if (item.ok) {
        const n = firstNumber(item.detail) ?? "1";
        return t("command.readiness.project.ok", { n });
      }
      return t("command.readiness.project.fail");
    }
    case "agents": {
      const n = firstNumber(item.detail) ?? "0";
      return t("command.readiness.agents.ok", { n });
    }
    case "meeting_brain": {
      if (item.detail.includes("Pure local") || item.detail.includes("mock dialogue")) {
        return t("command.readiness.meeting_brain.local");
      }
      if (item.ok) {
        const label = item.detail.replace(/^Default\s+/i, "").replace(/\.$/, "");
        return t("command.readiness.meeting_brain.ok", { label });
      }
      return t("command.readiness.meeting_brain.fail");
    }
    case "worker": {
      if (item.ok) {
        const secs = firstNumber(item.detail) ?? "5";
        return t("command.readiness.worker.ok", { secs });
      }
      if (item.detail.toLowerCase().includes("paused")) {
        return t("command.readiness.worker.paused");
      }
      return t("command.readiness.worker.disabled");
    }
    case "orchestrator":
      return item.ok
        ? t("command.readiness.orchestrator.ok")
        : t("command.readiness.orchestrator.fail");
    case "tokens": {
      const numbers = item.detail.match(/\d+/g) ?? [];
      const pool = numbers[0] ?? "0";
      const guard = numbers[1] ?? numbers[0] ?? "0";
      return item.ok
        ? t("command.readiness.tokens.ok", { pool, guard })
        : t("command.readiness.tokens.fail", { pool, guard });
    }
    case "execution_runtime": {
      if (item.detail.includes("in-app LLM") || item.detail.includes("Using in-app")) {
        return t("command.readiness.runtime.llm");
      }
      if (item.detail.includes("ready")) {
        const n = firstNumber(item.detail) ?? "1";
        return t("command.readiness.runtime.ready", { n });
      }
      if (item.detail.includes("missing") || item.detail.includes("Missing")) {
        return t("command.readiness.runtime.missing");
      }
      return item.detail;
    }
    default:
      return item.detail;
  }
}

export function alertMessage(t: TFn, alert: CommandCenterAlert): string {
  const msg = alert.message;
  if (msg.includes("paused") || msg.includes("Execution queue is paused")) {
    return t("command.alert.executionPaused");
  }
  if (msg.includes("Token pool is low")) {
    return t("command.alert.tokenLow");
  }
  const blocked = msg.match(/^(\d+)\s+blocked/i);
  if (blocked) {
    return t("command.alert.blockedTasks", { n: blocked[1] });
  }
  const unassigned = msg.match(/^(\d+)\s+sprint task/i);
  if (unassigned) {
    return t("command.alert.unassignedTasks", { n: unassigned[1] });
  }
  const directive = msg.match(/^Directive awaiting route:\s*(.+)$/i);
  if (directive) {
    return t("command.alert.directiveAwait", { title: directive[1] });
  }
  return msg;
}
