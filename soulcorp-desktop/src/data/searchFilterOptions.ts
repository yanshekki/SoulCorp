import type { SearchTypeFilterOption } from "../components/UI/SearchTypeFilter";
import { SEARCH_TYPE_ALL } from "../utils/searchTypeFilters";

// labelKey is resolved via useI18n in SearchTypeFilter; English label kept for tests/fallback.
export const EMPLOYEE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "name", label: "Name", labelKey: "searchType.name" },
  { value: "role", label: "Role", labelKey: "searchType.role" },
  { value: "department", label: "Department", labelKey: "searchType.department" },
];

export const TRANSCRIPT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "speaker", label: "Speaker", labelKey: "searchType.speaker" },
  { value: "content", label: "Message", labelKey: "searchType.message" },
  { value: "provider", label: "Provider", labelKey: "searchType.provider" },
];

export const EXECUTION_RUN_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "task", label: "Task", labelKey: "searchType.task" },
  { value: "agent", label: "Agent", labelKey: "searchType.agent" },
  { value: "status", label: "Status", labelKey: "searchType.status" },
  { value: "summary", label: "Summary", labelKey: "searchType.summary" },
];

export const OBSERVATORY_HISTORY_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All types", labelKey: "searchType.allTypes" },
  { value: "meeting", label: "Meeting", labelKey: "searchType.meeting" },
  { value: "execution", label: "Execution", labelKey: "searchType.execution" },
  { value: "step", label: "Steps", labelKey: "searchType.step" },
  { value: "session", label: "Sessions", labelKey: "searchType.session" },
  { value: "error", label: "Errors", labelKey: "searchType.error" },
  { value: "deliverable", label: "Deliverables", labelKey: "searchType.deliverable" },
];

export const BACKLOG_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "story", label: "Story", labelKey: "searchType.story" },
  { value: "task", label: "Task", labelKey: "searchType.task" },
  { value: "assignee", label: "Assignee", labelKey: "searchType.assignee" },
  { value: "department", label: "Department", labelKey: "searchType.department" },
];

export const LEDGER_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "source", label: "Source", labelKey: "searchType.source" },
  { value: "department", label: "Department", labelKey: "searchType.department" },
  { value: "agent", label: "Agent", labelKey: "searchType.agent" },
];

export const MARKETPLACE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "title", label: "Title", labelKey: "searchType.title" },
  { value: "description", label: "Description", labelKey: "searchType.description" },
  { value: "skills", label: "Skills", labelKey: "searchType.skills" },
  { value: "status", label: "Status", labelKey: "searchType.status" },
];

export const ACHIEVEMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All types", labelKey: "searchType.allTypes" },
  { value: "achievement", label: "Achievements", labelKey: "searchType.achievement" },
  { value: "ending", label: "Endings", labelKey: "searchType.ending" },
  { value: "growth", label: "Growth", labelKey: "searchType.growth" },
  { value: "culture", label: "Culture", labelKey: "searchType.culture" },
  { value: "productivity", label: "Productivity", labelKey: "searchType.productivity" },
];

export const WORKSPACE_ACTIVITY_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "title", label: "Title", labelKey: "searchType.title" },
  { value: "agent", label: "Agent", labelKey: "searchType.agent" },
  { value: "action", label: "Action", labelKey: "searchType.action" },
];

export const COMMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "author", label: "Author", labelKey: "searchType.author" },
  { value: "content", label: "Comment", labelKey: "searchType.comment" },
];

export const VERSION_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "author", label: "Author", labelKey: "searchType.author" },
  { value: "summary", label: "Summary", labelKey: "searchType.summary" },
];

export const DIRECTIVE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All statuses", labelKey: "searchType.allStatuses" },
  { value: "open", label: "Open", labelKey: "searchType.open" },
  { value: "routed", label: "Routed", labelKey: "searchType.routed" },
  { value: "executing", label: "Executing", labelKey: "searchType.executing" },
  { value: "done", label: "Done", labelKey: "searchType.done" },
  { value: "cancelled", label: "Cancelled", labelKey: "searchType.cancelled" },
  { value: "meeting", label: "Meeting", labelKey: "searchType.meeting" },
  { value: "co_ceo", label: "Co-CEO", labelKey: "searchType.co_ceo" },
  { value: "marketplace", label: "Marketplace", labelKey: "searchType.marketplace" },
];

export const DIRECTIVE_TEXT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "title", label: "Title", labelKey: "searchType.title" },
  { value: "body", label: "Description", labelKey: "searchType.body" },
  { value: "source", label: "Source", labelKey: "searchType.source" },
];

export const EVENT_FEED_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "title", label: "Title", labelKey: "searchType.title" },
  { value: "body", label: "Details", labelKey: "searchType.details" },
  { value: "kind", label: "Kind", labelKey: "searchType.kind" },
];

export const GOD_MODE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All types", labelKey: "searchType.allTypes" },
  { value: "simulation", label: "Simulation", labelKey: "searchType.simulation" },
  { value: "economy", label: "Economy", labelKey: "searchType.economy" },
  { value: "agents", label: "Agents", labelKey: "searchType.agents" },
  { value: "chaos", label: "Chaos", labelKey: "searchType.chaos" },
];

export const WORKSPACE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All items", labelKey: "searchType.allItems" },
  { value: "page", label: "Pages", labelKey: "searchType.page" },
  { value: "file", label: "Files", labelKey: "searchType.file" },
];

export const AGENT_WORKSPACE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "title", label: "Title", labelKey: "searchType.title" },
  { value: "content", label: "Content", labelKey: "searchType.content" },
];

export const DEPARTMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "department", label: "Department", labelKey: "searchType.department" },
  { value: "agent", label: "Agent", labelKey: "searchType.agent" },
];

export const RECRUITMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields", labelKey: "searchType.allFields" },
  { value: "name", label: "Name", labelKey: "searchType.name" },
  { value: "role", label: "Role", labelKey: "searchType.role" },
  { value: "skills", label: "Skills", labelKey: "searchType.skills" },
];

export const EXECUTION_TEXT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All sections", labelKey: "searchType.allSections" },
  { value: "output", label: "Output", labelKey: "searchType.output" },
  { value: "error", label: "Error", labelKey: "searchType.errorOne" },
  { value: "summary", label: "Summary", labelKey: "searchType.summary" },
];
