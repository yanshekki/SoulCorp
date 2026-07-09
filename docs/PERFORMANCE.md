# Performance Architecture

**Last updated: July 2026**

## Overview

SoulCorp optimizes for **fast panel switching** and **non-blocking workspace I/O** on mid-range hardware. The perf pass (commits `03fe6c7`, `c316efe`) added lazy-loaded UI, panel keep-alive, async Rust commands, in-memory caches, and WebGL render skipping when the 3D office is not visible.

---

## Implemented

| Optimization | Status | Key paths |
|--------------|--------|-----------|
| React.lazy all sidebar panels | ✅ | `config/lazyPanels.ts` |
| PanelHost LRU keep-alive (6) | ✅ | `components/UI/PanelHost.tsx` |
| Vite manualChunks | ✅ | `vite.config.ts` — vendor-three, vendor-tiptap, vendor-tauri |
| TipTap lazy in editor | ✅ | `workspace/PageEditor.tsx` |
| FileViewer lazy | ✅ | `workspace/WorkspaceMainPanel.tsx` |
| Workspace bootstrap skip | ✅ | Deferred heavy init on first open |
| Async workspace commands | ✅ | `commands/workspace.rs` + `spawn_blocking` |
| Workspace page LRU cache (64) | ✅ | `workspace/cache.rs` |
| Storage root cache | ✅ | `open_cached_storage` per company |
| Removed normalize from list_tree hot path | ✅ | `repair_folder_orders` on demand |
| Scrum snapshot FE cache | ✅ | `stores/scrumSnapshotCache.ts` |
| Nav prefetch | ✅ | Prefetch likely next panel chunks |
| Scrum-changed debounce | ✅ | Reduces snapshot refetch storms |
| WebGL skip when office inactive | ✅ | `ThreeOfficeRenderer.tsx` — skips render when `activePanel !== "office"` |
| Low power mode setting | ✅ | Reduces 3D update frequency |

---

## Architecture

### Frontend loading strategy

```
App mount
  └── PanelHost (only active + up to 5 previously visited panels mounted)
        └── React.lazy panel component
              └── Suspense fallback (PanelSuspense)
```

LRU eviction unmounts least-recently-used panels beyond `MAX_CACHED_PANELS = 6`.

### Bundle splitting

| Chunk | Contents |
|-------|----------|
| `vendor-three` | three, @react-three/fiber, @react-three/drei |
| `vendor-tiptap` | @tiptap/* extensions |
| `vendor-tauri` | @tauri-apps/api, plugins |

### Backend I/O

Heavy workspace operations run on the blocking thread pool:

```rust
tokio::task::spawn_blocking(move || { /* disk + parse */ })
```

`list_workspace_snapshot` returns a compact snapshot for initial render; detail fetches use `get_workspace_page` with cache hits from `get_cached_page`.

### 3D render gating

The office render loop continues `requestAnimationFrame` but **skips scene updates** when the user is on another panel. This avoids GPU/CPU cost while CEO workflow panels are active.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Service worker / PWA caching | Desktop app only |
| Rust-side scrum snapshot cache | ✅ Fingerprint cache in `get_scrum_snapshot` (+ FE cache) |
| WASM workspace parser | Rust native parsing used |
| Automatic perf profiling overlay | Manual devtools only |
| Interior viewport pause | Campus renderer gated; design viewport may still run when open |

---

## Verification

```bash
cd soulcorp-desktop
pnpm verify
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Compare cold vs warm panel switch in devtools Network tab — second visit should not re-fetch the lazy chunk.

---

## Related docs

- [TAURI_DESKTOP_SPEC.md](TAURI_DESKTOP_SPEC.md)
- [NOTION_LIKE_UI_DATA_SYNC.md](NOTION_LIKE_UI_DATA_SYNC.md)
- [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)