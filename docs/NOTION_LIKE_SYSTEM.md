# NOTION_LIKE_SYSTEM.md
**Real-time Notion-style Document & Progress System**

## Overview
SoulCorp includes a built-in, lightweight Notion-like workspace directly inside the desktop app. This allows users (and AI agents) to create, edit, and view company documents, project progress, meeting notes, deliverables, and results in real time — without leaving the game.

## Core Features

### 1. Company Workspace (Shared)
- A central "Company Docs" section (accessible from the main menu or by clicking the HQ building)
- Supports:
  - Pages (like Notion pages)
  - Databases (project tracker, OKR, deliverable log)
  - Folders & sub-pages
  - Real-time collaborative editing (when multiple agents or the player are viewing/editing)
- Every completed gig or internal project automatically generates a page with:
  - Summary
  - Agent chat logs from the project
  - Deliverables (code, links, PDFs, images)
  - Progress timeline + final results

### 2. Per-Agent Personal Folders
- Every AI employee has their own private workspace folder:
  - `Agents/[AgentName]/`
  - Inside: Personal notes, task lists, meeting summaries they attended, self-reflections, skill improvement logs
- Agents can autonomously create and update pages in their own folder (based on their SOUL.md personality)
- Player can view (and edit with permission) any agent's folder

### 3. Real-time Sync & Collaboration
- When the player or agents edit a page, changes appear instantly for everyone viewing it (local first, then sync to soulmd-hub when online)
- Version history (like Notion)
- Comments & @mentions (agents can @ each other or the player)
- Templates: Meeting Notes, Project Brief, Post-mortem, OKR, Client Report, etc.

### 4. Integration with Game Systems
- Project progress in the isometric view is directly linked to the Notion-style pages
- When agents finish work, the results + chat history are automatically appended to the relevant page
- Player can drag deliverables from agent chat directly into a Notion page
- Search across all company + agent documents (powered by local + optional hub index)

## Technical Implementation (Tauri)
- Local storage: SQLite + file-based markdown/JSON (works fully offline)
- Editor: TipTap / BlockNote.js or similar (Notion-like block editor)
- Real-time collaboration (local): Yjs or similar CRDT for multi-user editing inside the app
- Sync to soulmd-hub: When user clicks Sync, documents are pushed as structured data (or Markdown + attachments)
- Agent access: Rust backend exposes safe APIs so agents can read/write pages via function calling

## Benefits for Different Users
- **Casual / Fun players**: Beautiful living company wiki that grows organically with agent activity
- **Serious productivity users**: Use it as a real internal knowledge base + project management tool (toggle off random events for clean workflow)
- **Teams**: Multiple humans can join the same company (future multiplayer) and co-edit docs in real time

## Pro / VIP Advantages
- Unlimited pages & storage
- Advanced search + AI summarization of long documents
- Auto-generated weekly company reports
- Export entire workspace as Notion import / Markdown zip / PDF

**This turns SoulCorp from "just a game" into a genuine hybrid work + simulation platform.**
