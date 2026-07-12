export type LogLevel = "error" | "warn" | "info";

export type LogCategory =
  | "meeting"
  | "execution"
  | "worker"
  | "ai"
  | "hub"
  | "workspace"
  | "settings"
  | "finance"
  | "system"
  | "ui";

export interface AppLogEntry {
  id: string;
  created_at: string;
  level: string;
  category: string;
  source: string;
  message: string;
  detail?: string | null;
  company_id?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface AppLogQuery {
  q?: string | null;
  level?: string | null;
  category?: string | null;
  company_id?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface AppLogPage {
  items: AppLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface AppLogStats {
  total: number;
  error: number;
  warn: number;
  info: number;
  by_category: CategoryCount[];
}

export const LOG_LEVELS: Array<{ value: string; labelKey: string }> = [
  { value: "all", labelKey: "logs.level.all" },
  { value: "error", labelKey: "logs.level.error" },
  { value: "warn", labelKey: "logs.level.warn" },
  { value: "info", labelKey: "logs.level.info" },
];

export const LOG_CATEGORIES: Array<{ value: string; labelKey: string }> = [
  { value: "all", labelKey: "logs.cat.all" },
  { value: "meeting", labelKey: "logs.cat.meeting" },
  { value: "execution", labelKey: "logs.cat.execution" },
  { value: "worker", labelKey: "logs.cat.worker" },
  { value: "ai", labelKey: "logs.cat.ai" },
  { value: "hub", labelKey: "logs.cat.hub" },
  { value: "workspace", labelKey: "logs.cat.workspace" },
  { value: "settings", labelKey: "logs.cat.settings" },
  { value: "finance", labelKey: "logs.cat.finance" },
  { value: "system", labelKey: "logs.cat.system" },
  { value: "ui", labelKey: "logs.cat.ui" },
];

export const LOG_DATE_PRESETS: Array<{ value: string; labelKey: string }> = [
  { value: "all", labelKey: "logs.date.all" },
  { value: "today", labelKey: "logs.date.today" },
  { value: "24h", labelKey: "logs.date.24h" },
  { value: "7d", labelKey: "logs.date.7d" },
];
