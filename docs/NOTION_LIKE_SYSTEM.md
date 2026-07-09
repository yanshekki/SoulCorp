# Notion-like Workspace System

**Last updated: July 2026**

## Overview

The built-in **Workspace** (CEO step 3) is a Notion-style productivity layer: markdown pages, folders, files, entity links, templates, comments, and version history. **Workspace UX 2.0** (phase 20) added a six-view navigator, command palette, context menus, pinned/recent lists, and organize mode.

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| Workspace shell | ✅ | `components/workspace/WorkspaceShell.tsx` |
| Six-view navigator | ✅ | `WorkspaceNavigator.tsx`, `workspaceNav.ts` |
| Views: recent/pinned/projects/agents/files/browse | ✅ | `WORKSPACE_NAV_VIEWS` |
| Command palette | ✅ | `WorkspaceCommandPalette.tsx` |
| TipTap page editor (lazy) | ✅ | `PageEditor.tsx`, `SoulMdEditor.tsx` |
| File attachments + lazy viewer | ✅ | `FileViewer.tsx`, `WorkspaceMainPanel.tsx` |
| Pinned + recent tracking | ✅ | `workspaceStore.ts` |
| Organize mode (reorder) | ✅ | `organizeMode` in store |
| Entity links + backlinks | ✅ | `link_workspace_entity`, `find_workspace_backlinks` |
| Templates | ✅ | `list_workspace_templates`, `create_page_from_template_cmd` |
| Page versions + restore | ✅ | `list_page_versions`, `restore_page_version` |
| Comments | ✅ | `list_page_comments`, `add_page_comment` |
| Presence indicators | ✅ | `set_workspace_presence` |
| Database view | ✅ | `get_workspace_database` |
| Search | ✅ | `search_workspace` (FTS5) |
| CEO workflow step 3 | ✅ | `navigation.ts` |

---

## Architecture

### Six views

| View | Purpose |
|------|---------|
| `recent` | Last opened pages/files |
| `pinned` | User-starred items |
| `projects` | Grouped by project folders |
| `agents` | Per-agent workspace folders |
| `files` | Non-markdown attachments |
| `browse` | Full folder tree + organize mode |

### CEO loop position

Projects produce deliverables → Meeting aligns → **Workspace** is where the CEO reviews pages, briefs, and agent output before org/hiring steps.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Real-time multi-user co-editing | Local presence only |
| Kanban database view | Table/database basic |
| Mobile workspace | Desktop only |
| Notion import | Markdown ZIP export only |

---

## Related docs

- [NOTION_LIKE_UI_DATA_SYNC.md](NOTION_LIKE_UI_DATA_SYNC.md)
- [WORKSPACE_FOLDERS_SYSTEM.md](WORKSPACE_FOLDERS_SYSTEM.md)
- [COMPANY_AUTOPILOT.md](COMPANY_AUTOPILOT.md)