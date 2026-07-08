import type { SearchTypeFilterOption } from "../components/UI/SearchTypeFilter";
import { SEARCH_TYPE_ALL } from "../utils/searchTypeFilters";

// Explicit value ids for stable filtering logic
export const EMPLOYEE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "name", label: "Name" },
  { value: "role", label: "Role" },
  { value: "department", label: "Department" },
];

export const TRANSCRIPT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "speaker", label: "Speaker" },
  { value: "content", label: "Message" },
  { value: "provider", label: "Provider" },
];

export const EXECUTION_RUN_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "task", label: "Task" },
  { value: "agent", label: "Agent" },
  { value: "status", label: "Status" },
  { value: "summary", label: "Summary" },
];

export const OBSERVATORY_HISTORY_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All types" },
  { value: "meeting", label: "Meeting" },
  { value: "execution", label: "Execution" },
  { value: "step", label: "Steps" },
  { value: "session", label: "Sessions" },
  { value: "error", label: "Errors" },
  { value: "deliverable", label: "Deliverables" },
];

export const BACKLOG_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "story", label: "Story" },
  { value: "task", label: "Task" },
  { value: "assignee", label: "Assignee" },
  { value: "department", label: "Department" },
];

export const LEDGER_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "source", label: "Source" },
  { value: "department", label: "Department" },
  { value: "agent", label: "Agent" },
];

export const MARKETPLACE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "title", label: "Title" },
  { value: "description", label: "Description" },
  { value: "skills", label: "Skills" },
  { value: "status", label: "Status" },
];

export const ACHIEVEMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All types" },
  { value: "achievement", label: "Achievements" },
  { value: "ending", label: "Endings" },
  { value: "growth", label: "Growth" },
  { value: "culture", label: "Culture" },
  { value: "productivity", label: "Productivity" },
];

export const WORKSPACE_ACTIVITY_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "title", label: "Title" },
  { value: "agent", label: "Agent" },
  { value: "action", label: "Action" },
];

export const COMMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "author", label: "Author" },
  { value: "content", label: "Comment" },
];

export const VERSION_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "author", label: "Author" },
  { value: "summary", label: "Summary" },
];

export const DIRECTIVE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "routed", label: "Routed" },
  { value: "executing", label: "Executing" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
  { value: "meeting", label: "Meeting" },
  { value: "co_ceo", label: "Co-CEO" },
  { value: "marketplace", label: "Marketplace" },
];

export const DIRECTIVE_TEXT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "title", label: "Title" },
  { value: "body", label: "Description" },
  { value: "source", label: "Source" },
];

export const EVENT_FEED_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "title", label: "Title" },
  { value: "body", label: "Details" },
  { value: "kind", label: "Kind" },
];

export const GOD_MODE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All types" },
  { value: "simulation", label: "Simulation" },
  { value: "economy", label: "Economy" },
  { value: "agents", label: "Agents" },
  { value: "chaos", label: "Chaos" },
];

export const WORKSPACE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All items" },
  { value: "page", label: "Pages" },
  { value: "file", label: "Files" },
];

export const AGENT_WORKSPACE_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
];

export const DEPARTMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "department", label: "Department" },
  { value: "agent", label: "Agent" },
];

export const RECRUITMENT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All fields" },
  { value: "name", label: "Name" },
  { value: "role", label: "Role" },
  { value: "skills", label: "Skills" },
];

export const EXECUTION_TEXT_SEARCH_TYPES: SearchTypeFilterOption[] = [
  { value: SEARCH_TYPE_ALL, label: "All sections" },
  { value: "output", label: "Output" },
  { value: "error", label: "Error" },
  { value: "summary", label: "Summary" },
];

// Remove unused withAll - I added it but didn't use. Let me remove from file when writing - actually I didn't include withAll in the final write. Good.