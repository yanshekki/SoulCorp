# WORKSPACE_FOLDERS_SYSTEM.md
**Per-Employee Folders + User Workspace System**

## Overview
Every AI agent and every human user has their own structured workspace folder system inside SoulCorp. This makes the company feel alive and organized, while giving users powerful tools to manage knowledge and deliverables.

## Folder Structure (Local + Synced)

### Company Root
```
Company/
├── Projects/
│   ├── Active/
│   ├── Completed/
│   └── Archive/
├── Departments/
│   ├── Engineering/
│   ├── Design/
│   ├── Marketing/
│   └── HR/
├── Meetings/
├── Finance/
├── Knowledge Base/
└── Exported Deliverables/
```

### Per-Agent Private Workspace
```
Agents/
├── [AgentName]/
│   ├── Tasks/
│   ├── Meeting Notes/
│   ├── Self Reflections/
│   ├── Skill Logs/
│   ├── Relationships/
│   └── Personal Projects/
```

### User (Player) Workspace
```
User/
├── My Notes/
├── Strategic Plans/
├── Agent Reviews/
├── Financial Overview/
├── God Mode Logs/
└── Custom Workspaces/   ← User can create unlimited custom folders
```

## Key Features

### 1. Agent Autonomy
- Agents can create, edit, and organize files inside **their own folder** based on their SOUL.md
- Example: A highly organized agent might auto-create daily standup notes and tag them properly
- A chaotic creative agent might have messy folders but brilliant ideas scattered everywhere
- Player can browse any agent's workspace (read-only by default, or with permission)

### 2. Real-time Updates
- When an agent finishes a task or attends a meeting, relevant files are automatically created/updated in their folder and linked to the company project page
- Changes are visible immediately in the Notion-like viewer

### 3. Powerful Search & Linking
- Full-text search across all company + agent folders
- Bi-directional linking (like Notion)
- Smart suggestions: "This meeting note is related to Project X and Agent Y's skill improvement"

### 4. User Customization
- Players can create their own folder structures
- Drag & drop files between agent folders and company folders
- Set permissions (e.g., "Only I can edit Engineering folder")
- Templates for common workspace setups (Startup, Agency, Product Company, Research Lab, etc.)

### 5. Export & Backup
- One-click export of any folder / entire company workspace
- Formats: Markdown zip, Notion import, PDF report, JSON
- Useful for serious users who want to keep a clean record of all work done by AI agents

## Integration with Other Systems
- **Notion-like Docs**: Every page lives inside these folders
- **Project System**: Project pages are automatically organized under `Projects/Active/`
- **Meeting System**: Meeting transcripts + outcomes are saved to both the relevant project and each participant's personal folder
- **Recruitment**: When you hire a new agent, their folder is automatically created with onboarding documents

## Privacy & Security
- All folders are stored locally by default (encrypted)
- Pro/VIP users can choose to sync selected folders to soulmd-hub (with end-to-end encryption)
- Agents cannot access other agents' private folders unless explicitly granted permission by the player

**This system makes SoulCorp feel like a living, breathing company with real organizational memory — while remaining fully usable as a serious productivity platform.**
