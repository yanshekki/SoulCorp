# TAURI_DESKTOP_SPEC.md
**Tauri 2.x Desktop Client Specification (Rust Backend)**

## Project Structure
```
soulcorp-desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Tauri entry + Rust commands
│   │   ├── commands/            # expose Rust functions to frontend
│   │   │   ├── agent.rs         # spawn/kill/manage local AI agents
│   │   │   ├── simulation.rs    # game tick, agent AI, queue processing
│   │   │   ├── sync.rs          # local queue + optional hub sync
│   │   │   └── near.rs          # NEAR transaction signing (via near-api-js or Rust SDK)
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                         # React frontend
│   ├── components/
│   │   ├── GameScene.tsx        # Three.js isometric world
│   │   ├── AgentSprite.tsx
│   │   ├── BuildingModal.tsx
│   │   └── UI/
│   ├── stores/                  # Zustand stores
│   ├── services/                # API client for soulmd-hub
│   └── App.tsx
├── package.json
└── README.md
```

## Core Rust Commands (exposed to JS)
- `start_local_agent(soul_md_path, role, dept, ai_provider)` → returns agent_id
- `run_simulation_tick()` → advances game world, agents work
- `get_local_queue_status()` → pending sync items
- `sync_with_hub(jwt_or_signature)` → push local changes, pull market updates
- `submit_gig_to_hub(gig_data)` → create gig on marketplace
- `sign_near_transaction(tx_payload)` → secure signing (user confirms in UI)

## Three.js Isometric World (Option 2)
- Orthographic camera, 45° angle
- Tile-based map (company building floors + outdoor "hub plaza")
- InstancedMesh for agents (performance)
- Click raycasting → building zoom + sub-scene load
- Post-processing: subtle pixel filter + soft shadows for cozy feel

## Offline-first Architecture
1. All simulation runs 100% locally (Rust game loop)
2. Every important action is queued locally (IndexedDB + Rust queue)
3. User explicitly presses "Sync with soulmd-hub" (Pro/VIP feature)
4. Conflict resolution: last-write-wins with clear UI notification
5. Pure Local Mode toggle for users who want zero cloud

## AI Provider Abstraction (重要)
為了支援多種 AI API（包括本地模型同 soulmd-hub API），Rust 後端需要有清晰嘅 **AI Provider** 抽象層：

### 支援嘅 AI Provider（至少）
- Local models（Ollama, vLLM, LM Studio 等）
- OpenAI / Claude / Grok 等常見 provider
- **soulmd-hub API**：
  - `POST /api/chat`
  - `POST /api/self-chat`

### 建議實現方式
- 在 `src-tauri/src/ai/` 建立 `provider.rs` trait
- 每個 provider 實現 `chat(prompt, system_prompt, temperature)` 方法
- Agent 啟動時可以選擇用邊個 provider（由玩家設定或 agent SOUL.md 指定）

**呢個設計可以讓玩家靈活選擇用本地模型定用 soulmd-hub 嘅 API，而唔使改 code。**

## Security Considerations (Rust)
- All NEAR signing happens in Rust (no private key exposed to JS)
- Local SOUL.md files are encrypted at rest (user password or OS keyring)
- Rate limiting on local agent spawning to prevent runaway costs
- AI API calls 應該有 timeout 同 error handling
- 敏感 API key 應該用 OS keyring 或加密儲存

## Performance Targets
- 60 FPS on mid-range laptop (Intel i5 + integrated graphics or better)
- 200+ agents simulated smoothly with instancing + LOD
- Local tick < 16ms (game loop in Rust)
- Cold start < 3 seconds

**This spec is ready for immediate Grok Build execution.**
