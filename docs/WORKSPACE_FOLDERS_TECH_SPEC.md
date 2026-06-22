# WORKSPACE_FOLDERS_TECH_SPEC.md
**Workspace Folders System — Technical Specification**

## 1. Folder Data Model

```ts
interface WorkspaceFolder {
  id: string;
  name: string;
  icon?: string;
  parentId?: string;
  workspaceType: 'company' | 'agent' | 'user' | 'custom';
  ownerId: string;                    // agentId or userId
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

interface Permission {
  subjectId: string;                  // agentId or userId
  role: 'owner' | 'editor' | 'viewer';
}
```

Every page belongs to exactly one folder. Folders can be nested.

## 2. Agent Autonomy Rules

- By default, each agent has **full read + write** access only to their own folder (`Agents/[AgentName]/`)
- Agents **cannot** read or write other agents' private folders unless the player grants explicit permission
- Agents **can** read + append to company project pages that are relevant to their current tasks
- Agent behavior when creating content is heavily influenced by their `SOUL.md` (e.g. a very organized agent will create neatly named pages and tag them; a chaotic creative agent may create many loosely structured notes)

## 3. Permission System (Simple but Powerful)

- Player (user) is always **owner** of the entire company workspace
- Player can grant/revoke access to any folder for any agent
- Agents can request access to another agent's folder (triggers a small event / meeting)
- "Public within company" vs "Private" toggle on folders

## 4. File & Page Storage

- Every page is stored as a single file:
  - `{pageId}.json` — structured data + metadata
  - `{pageId}.md` — human-readable Markdown version (for easy export/git)
- Attachments (images, code files, PDFs) are stored in an `attachments/` subfolder next to the page file
- This structure makes backup, export, and even git versioning very natural

## 5. Sync Behavior

- Local changes to any folder/page are tracked with a simple "dirty" flag + timestamp
- When user triggers sync:
  - Only changed folders/pages since last sync are uploaded
  - Agent-created content in private folders is **never** synced unless the player explicitly enables "Share agent private workspaces with hub"
- This keeps private agent thoughts private by default

## 6. UI / Interaction

- In the left sidebar: Collapsible tree view of all folders (Company → Departments → Agents → Custom)
- Right-click on any folder → context menu (New Page, New Subfolder, Permissions, Export, Delete)
- Drag & drop pages between folders (with permission checks)
- Search bar at the top searches across **all** folders the current viewer has access to

## 7. Integration Points

- **Notion-like Editor**: Lives on top of this folder system
- **Agent System**: Agents primarily operate inside their own folder + linked company project pages
- **Meeting System**: Meeting outputs are automatically saved to:
  - The relevant project page
  - Each participating agent's personal folder
- **Recruitment**: When hiring a new agent, their folder + default pages (Onboarding, First Week Goals, etc.) are auto-created

## 8. Future Extensibility

- "Team Workspaces" (shared folder for a group of agents working on the same project)
- "External Client Workspaces" (shared with clients via secure link — Pro/VIP feature)
- Git-like branching for experimental ideas inside a folder

**This folder system gives SoulCorp real organizational depth while remaining simple and intuitive to use.**
