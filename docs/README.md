# SoulCorp - AI Company Simulator

**Official Extension of soulmd-hub.ysk.hk**

## Project Overview

SoulCorp is a hybrid desktop + web platform that turns the soulmd-hub into a full-fledged **AI-powered company simulation game**.

Players build and manage AI agent companies in a beautiful isometric game world (Stardew Valley × Pokémon Legends style), while the backend leverages the existing soulmd-hub infrastructure for marketplace, gig matching, fee collection, and $SOUL economy.

### Core Vision
- **Desktop Game Client**: Tauri 2.x (Rust backend) + React + Three.js — fully local, offline-first, high-performance simulation.
- **Platform Hub**: Extend existing soulmd-hub (PHP + MySQL + NEAR) with new marketplace, sync, and Pro/VIP features.
- **Economy**: Real NEAR USDT (usdt.tether-token.near) + $SOUL (soul.tkn.near) with 10% platform fee.
- **True Productivity**: Agents produce real deliverables (code, websites, reports) that can be exported or sold on the marketplace.

## Key Features
- One-click company creation with full department structure
- AI employees with independent SOUL.md personalities (from soulmd-hub)
- Isometric game world with agents walking, working, and interacting
- Gig marketplace: post jobs or take gigs from other players/companies
- QC / Receiving department for outsourced work
- Fully offline-capable with optional cloud sync (Pro/VIP)
- Real blockchain settlement on NEAR
- Export real products (code, sites, PDFs) from agent work

## Folder Structure in This Drive
- `/SoulCorp/` — Main project documents, specs, and planning
- `/SoulCorp/soulmd-hub/` — Dedicated specs for extending the existing soulmd-hub repo (for independent Grok Build sessions)

## Tech Stack Summary
- **Desktop**: Tauri 2.x (Rust) + React 19 + Three.js (isometric Option 2)
- **Hub Extension**: Existing soulmd-hub PHP/MySQL/NEAR (add new controllers + tables)
- **Local DB (Desktop)**: Prisma + SQLite
- **Sync**: User-controlled offline-first queue + optional WebSocket sync
- **Blockchain**: NEAR Protocol (USDT + $SOUL)

## Current Status (June 2026)
- Architecture fully locked and reviewed
- Visual style locked to Option 2 (Stardew + Pokémon isometric)
- Tauri + Rust backend chosen
- Integration plan for soulmd-hub ready
- All core .md specifications prepared

## Next Steps
1. Extend soulmd-hub with new marketplace + sync endpoints (see soulmd-hub/ folder)
2. Build Tauri desktop client (Rust + Three.js isometric world)
3. Implement local agent system with SOUL.md loading
4. Add NEAR transaction + fee logic
5. Launch closed beta with existing soulmd-hub users

---

**This project is 100% aligned with soulmd-hub's mission**: giving AI agents real identity (SOUL.md), real economy ($SOUL), and now — a living simulated world to work and grow in.

Built with ❤️ by the YSK Limited team for the soulmd-hub community.
