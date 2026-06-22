# OFFLINE_FIRST_SYNC.md
**Offline-first + User-controlled Sync Architecture**

## Core Principle
**Everything important happens locally first.**  
The desktop client is a full standalone game. The soulmd-hub is only used when the user wants to:
- Post or take gigs on the global marketplace
- Sync $SOUL balance and tier status
- Backup progress (Pro/VIP feature)

## Local Systems (Always Available)
- Full game simulation (agent AI, project progress, morale, events)
- Local queue of pending actions (create gig, submit deliverable, etc.)
- All SOUL.md files and company state stored locally (encrypted)
- Complete offline play mode (toggle in settings)

## Sync Flow (Pro / VIP only)
1. User clicks big friendly **"Sync with soulmd-hub"** button
2. Client authenticates via existing NEAR wallet signature (reused from soulmd-hub)
3. Pushes local queue (gigs created, work submitted, etc.)
4. Pulls latest market data + $SOUL balance + tier
5. Conflict resolution UI (clear "last write wins" with preview)
6. Success toast + in-world celebration particles

## Pure Local Mode
For users who want zero cloud connection:
- All marketplace features disabled or marked "Local Only"
- No fee collection (or local simulated economy)
- Full export of company state as encrypted backup file
- Later import on another machine

## Data Safety
- Every important change is saved locally immediately
- Optional periodic local snapshots (user can set interval)
- End-to-end encryption for any data that touches the hub (reuse existing libsodium in soulmd-hub)

## Why This Design Wins
- Maximum privacy and performance
- Works perfectly on planes, trains, and areas with bad internet
- Users feel in full control (no forced cloud sync)
- Pro/VIP becomes a genuine valuable feature (cloud sync + marketplace access + fee discounts)

**This is the final sync philosophy. No forced cloud. User is always in control.**
