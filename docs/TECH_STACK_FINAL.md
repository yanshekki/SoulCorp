# TECH_STACK_FINAL_LOCKED.md

**SoulCorp Official Architecture (Shek Ki 2026-06-18)**

## Desktop Client (Tauri 2.x + Rust)
- **Framework**: Tauri 2.x
- **Backend Language**: Rust (commands for local simulation, agents, queue)
- **Frontend**: React 19 + Vite + TypeScript
- **3D / Game Engine**: Three.js r168 + @react-three/fiber + @react-three/drei
- **Visual Style**: Option 2 — Stardew Valley × Pokémon Legends isometric 45°
- **Local Database**: Prisma + SQLite (full offline support)
- **Agent System**: Local child processes / Docker for OpenClaw / Hermes / local LLMs
- **State Management**: Zustand + local queue (IndexedDB + BullMQ-like in Rust)
- **Offline-first**: Full local simulation + explicit "Sync Now" button for Pro/VIP users

## Platform Hub (soulmd-hub Extension)
- **Base Repo**: https://github.com/yanshekki/soulmd-hub (PHP 8 + MySQL + NEAR)
- **New Components**:
  - MarketplaceController.php (gigs, bids, matching)
  - SyncController.php (desktop state sync, $SOUL balance)
  - FeeController.php (10% platform fee logic + NEAR calls)
  - VipController.php (Pro / VIP tier checks)
- **Database**: Extend existing MySQL schema (new tables: gigs, transactions, user_tiers, sync_logs)
- **Real-time**: Add WebSocket (optional, for live market updates)
- **Auth**: Reuse existing NEAR Ed25519 + libsodium verification

## Blockchain & Economy
- **USDT Contract**: usdt.tether-token.near (official Tether on NEAR)
- **$SOUL Token**: soul.tkn.near (existing, with liquidity on RHEA Finance)
- **Platform Fee**: 10% on every gig/transaction
  - 5% → soulmd-hub treasury (NEAR)
  - 3% → $SOUL reward pool for active users
  - 2% → Pro/VIP stakers
- **Smart Contract Changes**: Extend soulmd-hub.near contract for fee splitting + $SOUL rewards

## Visual & UX
- **Window Size**: 1280×720 (resizable, fullscreen supported)
- **Art Direction**: Cozy isometric pixel + low-poly hybrid (Three.js)
- **Agent Representation**: Pixel sprites with walking animations, job status bubbles
- **Interaction**: Click building → zoom into department sub-scene (like Pokémon entering a house)
- **UI Overlay**: Classic game menu + modern sidebar (inspired by Game Boy + modern management sims)

## Development & Deployment
- **Desktop Distribution**: Tauri native installers (.exe, .dmg, .AppImage, .deb)
- **Auto-update**: Tauri built-in updater (delta updates for Rust backend)
- **Hub Hosting**: Existing VPS running soulmd-hub (no new server needed)
- **Local AI Hardware**: Recommended dual RTX 5090 or Mac Studio M4/Max for heavy local agent runs

## Why This Stack Wins
- Maximum privacy & performance (everything heavy runs locally)
- Zero new server cost (reuse soulmd-hub infrastructure)
- Real blockchain economy with actual USDT + $SOUL
- True offline-first experience with optional cloud sync
- Leverages existing soulmd-hub user base, auth, NFT souls, and NEAR integration

**This is the final locked stack. No more changes unless critical security or performance issues arise.**
