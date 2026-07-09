# Workspace Folders System

**Last updated: July 2026**

## Overview

Each company workspace is organized into **folders** aligned with org structure: company root, departments, projects, and per-agent sandboxes. Folders appear in the **agents** and **projects** navigator views and sync when hiring or editing departments.

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| Company workspace root | ✅ | `company_workspace_root` |
| Department folders | ✅ | Org chart + `sync_workspace_organization_cmd` |
| Agent personal folders | ✅ | Created on hire |
| Project-linked folders | ✅ | Scrum / autopilot brief pages |
| Folder tree UI | ✅ | `FolderTree.tsx`, browse view |
| Create/delete folder | ✅ | `create_workspace_folder`, `delete_workspace_folder` |
| Reorder items | ✅ | `reorder_workspace_items`, organize mode |
| Agent activity docs | ✅ | `workspace/activity_docs.rs` |
| Autopilot brief bootstrap | ✅ | `autopilot/brief_pages.rs` |

---

## Architecture

### Folder purposes

| Folder type | Typical contents |
|-------------|------------------|
| Company | Policies, shared templates |
| Department | Team notes, SOPs |
| Project | Briefs, deliverables, meeting notes |
| Agent | Journal, drafts, tool output |

### Org sync

When `hire_candidate` or department structure changes:

```
sync_workspace_organization_cmd
  → ensure folder per department
  → move/create agent subfolders
```

Called from `commands/recruitment.rs` after hire.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Folder-level permissions ACL | Agent tools use scoped API |
| Shared cross-company folders | Single company scope |
| Auto-archive stale projects | Manual delete |

---

## Related docs

- [WORKSPACE_FOLDERS_TECH_SPEC.md](WORKSPACE_FOLDERS_TECH_SPEC.md)
- [RECRUITMENT_HR.md](RECRUITMENT_HR.md)
- [NOTION_LIKE_SYSTEM.md](NOTION_LIKE_SYSTEM.md)