# ARCHITECTURE_OVERVIEW.md
**SoulCorp High-Level Architecture**

## 1. Overall Architecture Philosophy

SoulCorp follows a **Local-First** architecture with optional cloud integration.

- The **Tauri Desktop App** is the core product. It must work fully offline.
- **soulmd-hub** integration (marketplace, sync, $SOUL economy) is **optional**.
- All heavy computation (game simulation, agent AI, document system) happens locally.
- The desktop app can optionally connect to soulmd-hub for social/marketplace features.

---

## 2. High-Level System Diagram

![High-Level Architecture Diagram](https://drive.google.com/file/d/AMUf3/view)

**Key Components:**

- **Tauri Desktop Client** (Main Application)
  - React + Three.js Frontend (Isometric game world + UI)
  - Rust Backend (Core logic, simulation, AI provider management)
  - Local SQLite + File Storage
  - AI Provider Layer (supports local models + soulmd-hub API)

- **soulmd-hub** (Optional)
  - PHP + MySQL backend
  - NEAR blockchain integration (USDT + $SOUL)
  - Provides marketplace, user sync, and economy features when connected

---

## 3. Desktop App Internal Architecture

### 3.1 Layered Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        React Frontend                       │
│   (Three.js Isometric World + UI Components + Notion Editor)│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                      Rust Backend (Tauri)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Game Engine  │  │ Agent System │  │ Document System  │  │
│  │ (Simulation) │  │ (Behavior)   │  │ (Notion-like)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              AI Provider Abstraction Layer           │  │
│  │   (Local Models / OpenAI / Claude / soulmd-hub API)  │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Local SQLite │  │ File Storage │  │   Sync Queue     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Key Design Decisions

- **Rust Backend** handles:
  - Game simulation loop
  - Agent AI calls (via AI Provider)
  - Local data persistence
  - Optional NEAR transaction signing

- **React + Three.js Frontend** handles:
  - Isometric game visualization
  - User interface
  - Notion-like document editor

- **AI Provider Layer** is abstracted so the system can easily switch between:
  - Local models (Ollama, vLLM)
  - Cloud providers
  - soulmd-hub’s `/api/chat` and `/api/self-chat` endpoints

---

## 4. Data Flow

### Local-First Flow (Default)
1. Player interacts with the game
2. All changes are saved locally (SQLite + files)
3. Agent AI calls happen locally or via configured provider
4. Everything works without internet

### Optional Hub Sync Flow (Pro/VIP)
1. User clicks “Sync with soulmd-hub”
2. Desktop sends changes via signed requests
3. Hub processes marketplace actions, updates balances
4. Desktop receives updates (gigs, $SOUL balance, etc.)

---

## 5. AI Integration Points

The AI Provider Layer in the Rust backend supports multiple backends:

- Local inference (recommended for heavy usage)
- External APIs (OpenAI, Claude, Grok, etc.)
- **soulmd-hub API** specifically:
  - `POST /api/chat`
  - `POST /api/self-chat`

This design allows players to choose performance vs cost vs privacy.

---

## 6. Summary

| Component              | Technology                  | Responsibility                     | Required?     |
|------------------------|-----------------------------|------------------------------------|---------------|
| Frontend               | React + Three.js            | Game UI + Isometric world          | Yes           |
| Backend                | Rust (Tauri)                | Game logic, AI calls, storage      | Yes           |
| Local Storage          | SQLite + File System        | All game state & documents         | Yes           |
| AI Provider Layer      | Rust abstraction            | Call different LLM backends        | Yes           |
| soulmd-hub             | PHP + MySQL + NEAR          | Marketplace, sync, economy         | Optional      |
| Blockchain             | NEAR Protocol               | USDT payments + $SOUL rewards      | Optional      |

**SoulCorp is designed as a powerful local-first desktop application with optional social and economic features from soulmd-hub.**
