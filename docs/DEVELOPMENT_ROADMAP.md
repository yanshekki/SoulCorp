# DEVELOPMENT_ROADMAP.md
**SoulCorp Development Roadmap (Final Version)**

## Guiding Principles

- The desktop application must work **fully offline and independently** without connecting to soulmd-hub.
- Connecting to soulmd-hub (for marketplace and sync) is **optional** and should be implemented later.
- Prioritize building a solid local experience first.
- Deliver visible, playable results as early as possible.
- Keep the architecture clean and suitable for iterative development with AI assistance.

---

## Phase Overview

| Phase | Focus Area                              | Requires soulmd-hub? | Priority | Expected Outcome |
|-------|-----------------------------------------|----------------------|----------|------------------|
| 0     | Project Setup & Documentation           | No                   | High     | Clean project structure + final docs |
| 1     | Tauri Foundation + Isometric World      | No                   | Highest  | Playable 3D office with moving agents |
| 2     | Agent Core + Key Game Systems           | No                   | High     | Agents with personality + meetings + events |
| 3     | Notion-like Workspace + Folders         | No                   | High     | Real productivity value (documents & folders) |
| 4     | Local Polish & Completeness             | No                   | High     | Fully usable standalone desktop app |
| 5     | soulmd-hub Integration (Optional)       | Yes                  | Medium   | Marketplace + sync features |
| 6     | Advanced Features & Release Polish      | Partial              | Medium   | Pro/VIP, achievements, export, optimization |

---

## Phase Details

### Phase 0: Preparation & Project Setup
- Finalize all specification documents (`INDEX.md`, etc.)
- Initialize Tauri 2.x project (Rust + React + TypeScript + Three.js)
- Design local data architecture (SQLite + file-based storage)
- Set up basic project structure and coding standards
- Prepare soulmd-hub extension branch (database migrations, new controllers)

**Goal**: Solid foundation ready for development.

---

### Phase 1: Tauri Foundation + Isometric World
- Set up Tauri application with Rust backend and React frontend
- Implement basic Three.js isometric scene (Option 2 visual style)
- Agent sprites + basic walking animation
- Clickable buildings with zoom functionality
- Basic UI layout (sidebar, dashboard, menu)
- Simple state management

**Deliverable**: A visually working company office where agents can move around.

---

### Phase 2: Agent Core System + Core Game Mechanics
- Load and parse `SOUL.md` for agents
- Implement agent daily behavior loop (in Rust)
- **Meeting System** — observable multi-agent conversations
- **Random Events System** — with toggle for Serious Work Mode
- **Finance & Budget System**
- **God Mode** basic powers (Time Warp, morale control, etc.)

**Deliverable**: Agents feel alive. Players can watch meetings, experience events, and manage basic economy.

---

### Phase 3: Notion-like Workspace + Per-Agent Folders
- Implement block-based document editor (Notion-like)
- Per-agent private workspace folders
- Automatic document generation from agent activities
- Search, linking, and basic collaboration features
- Integration between game state and documents

**Deliverable**: A functional internal knowledge base that grows with agent work. Usable for real productivity.

---

### Phase 4: Local Experience Polish & Completeness
- Complete all local-only features (upgrades, achievements, export)
- Performance optimization (many agents)
- UX/UI refinement
- Ensure 100% offline functionality
- Finalize settings (including Random Events toggle)

**Deliverable**: A complete, polished, standalone desktop application that can be used seriously without any cloud connection.

---

### Phase 5: soulmd-hub Integration (Optional)
- Connect to soulmd-hub APIs (recruitment, marketplace)
- Implement Gig / Marketplace system
- Basic sync functionality (for Pro/VIP users)
- NEAR transaction handling for fees and rewards
- $SOUL balance integration

**Note**: This phase is intentionally placed later because the core experience must work without it.

**Deliverable**: Optional connection to soulmd-hub for marketplace and cross-device sync.

---

### Phase 6: Advanced Features & Final Polish
- Complete Pro / VIP system
- Achievements and multiple endings
- Advanced export features
- Final visual and performance polish
- Testing, bug fixing, and release preparation

---

## Key Decisions

- **soulmd-hub integration is optional** and deprioritized until the local experience is solid.
- AI API calls are abstracted in the Rust backend (supporting local models + soulmd-hub `/api/chat` & `/api/self-chat`).
- The Notion-like workspace and per-agent folders are treated as core local features (not dependent on the hub).

---

**This roadmap prioritizes building a strong, independent local product first, while keeping the door open for deeper soulmd-hub integration later.**
