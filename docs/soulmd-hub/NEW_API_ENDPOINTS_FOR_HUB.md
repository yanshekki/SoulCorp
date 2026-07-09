# New API Endpoints for soulmd-hub

**Last updated: July 2026**

## Overview

REST endpoints the **desktop client expects** from soulmd-hub. Implemented client-side in `soulcorp-desktop/src-tauri/src/hub/` and `gigs/`. Hub PHP may not expose all routes yet — treat this as the contract target.

---

## Implemented (desktop client)

| Client command | Expected hub capability |
|----------------|-------------------------|
| `sync_with_hub` | Pull/push sync payload |
| `get_hub_status` | Health + version |
| `update_hub_config` | Store API base URL + keys |
| `list_hub_gigs` | List open gigs |
| `create_hub_gig` | Post gig |
| `accept_hub_gig` | Assign to company |
| `start_gig_work` / `submit_gig_for_qc` | Work + QC flow |
| `complete_hub_gig` / `reject_gig_qc` / `dispute_hub_gig` | Close gig |
| `fetch_soul_balance` | $SOUL balance |
| `get_near_upgrade_config` | Tier upgrade metadata |
| `claim_near_tier_upgrade` | Verify on-chain payment |

---

## Endpoint reference (target)

### Marketplace

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/gigs` | List gigs (filters: status, skills) |
| POST | `/api/gigs` | Create gig |
| POST | `/api/gigs/{id}/accept` | Accept assignment |
| POST | `/api/gigs/{id}/submit` | Submit deliverable for QC |
| POST | `/api/gigs/{id}/complete` | Complete after QC pass |
| POST | `/api/gigs/{id}/dispute` | Open dispute |

### Sync & economy

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sync/desktop` | Bidirectional sync chunk |
| GET | `/api/user/soul-balance` | $SOUL balance |
| GET | `/api/user/tier` | Pro/VIP status |
| POST | `/api/user/tier/claim` | Claim NEAR upgrade |

### Auth

Reuse existing soulmd-hub NEAR Ed25519 / session auth — desktop sends same headers as web hub clients.

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| OpenAPI spec file in hub repo | Informal table here only |
| Rate limiting / idempotency keys | Not specified |
| Webhook callbacks to desktop | Pull sync only |

---

## Related docs

- [SOULMD_HUB_EXTENSION_PLAN.md](SOULMD_HUB_EXTENSION_PLAN.md)
- [EXPORT_REAL_PRODUCTS.md](../EXPORT_REAL_PRODUCTS.md)