# NOTION_LIKE_UI_DATA_SYNC.md
**Notion-like System — Detailed UI, Data Model & Sync Logic**

## 1. UI / UX Design

### Main Layout (Desktop App)
- Left sidebar: Workspace navigator (Company / Agents / My Workspace / Custom folders)
- Center: Main editor/viewer (Notion-style block editor)
- Right sidebar (contextual):
  - Page info + last edited by
  - Linked entities (related projects, agents, meetings)
  - Comments thread
  - Version history

### Editor Features
- Block-based editing (text, heading, to-do, image, code, embed, database)
- Slash commands (`/meeting`, `/deliverable`, `/agent`, `/project`)
- @mention agents or pages (auto-creates links)
- Drag & drop blocks + files from agent chat directly into pages
- Real-time cursors (when multiple agents/players are editing)

### Game Integration
- From the isometric view, player can right-click any agent or building → "Open Workspace"
- Project progress bar in game is clickable → jumps directly to the Notion page
- Completed deliverables appear as cards that can be dragged into pages

## 2. Data Model

### Core Entities

```ts
interface Page {
  id: string;
  title: string;
  icon?: string;
  parentId?: string;           // for nested pages/folders
  workspaceType: 'company' | 'agent' | 'user' | 'custom';
  ownerId?: string;            // agentId or userId
  content: Block[];            // rich block content (JSON)
  linkedEntities: LinkedEntity[];
  lastEditedAt: Date;
  lastEditedBy: string;
  version: number;
}

interface Block {
  id: string;
  type: 'text' | 'heading' | 'todo' | 'code' | 'image' | 'embed' | 'database';
  content: any;
  children?: Block[];
}

interface LinkedEntity {
  type: 'project' | 'agent' | 'meeting' | 'gig' | 'deliverable';
  id: string;
  title: string;
}
```

### Folder / Workspace Structure (Local)

```
workspaces/
├── company/
│   └── pages/
├── agents/
│   └── [agentId]/
│       └── pages/
├── user/
│   └── pages/
└── custom/
    └── [userCreatedWorkspaceId]/
```

All pages are stored as individual JSON + Markdown hybrid files for easy export and git-like versioning.

## 3. Real-time Sync Logic (Local + Cloud)

### Local (Always On)
- Uses **Yjs CRDT** (or similar) for real-time multi-user editing inside the Tauri app
- All changes are saved locally immediately (IndexedDB + file system)
- Conflict resolution: Last-write-wins with clear visual indicator + undo

### Cloud Sync (Pro / VIP only, user-initiated)
When user clicks "Sync with soulmd-hub":

1. Client collects all dirty pages since last sync
2. Signs request with NEAR wallet (reuse existing auth)
3. Pushes to `POST /api/sync/notion-push`
4. Hub returns latest changes from other devices/agents
5. Merge happens locally with conflict UI if needed

### Agent Access
- Rust backend exposes controlled APIs so agents can:
  - Read pages they have permission for
  - Create/update pages in their own workspace
  - Append content to company project pages (e.g. after finishing a task)
- All agent edits go through the same CRDT + sync pipeline

## 4. Performance & Offline Considerations
- Full-text search is local-first (using SQLite FTS or similar)
- Large pages are lazy-loaded
- Images and attachments are stored locally; only metadata + links are synced by default
- Pro/VIP users can choose "Sync full page content including images"

## 5. Security
- All local data is encrypted at rest (user password or OS keychain)
- When syncing, only pages the user/agent has explicit access to are transmitted
- soulmd-hub never sees content of private agent folders unless the player explicitly shares them

**This system turns SoulCorp into a genuine hybrid game + serious knowledge work platform.**
