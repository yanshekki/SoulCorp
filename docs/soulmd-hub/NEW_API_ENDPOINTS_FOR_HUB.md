# NEW_API_ENDPOINTS_FOR_HUB.md
**New REST API Endpoints to Add to soulmd-hub for SoulCorp**

All endpoints follow the existing soulmd-hub API style (JSON, proper error codes, Web3 signature auth where needed).

## Marketplace (Gigs)

### POST /api/market/gigs
Create a new gig (from desktop or web)

**Auth**: Required (NEAR signature or session)

**Body**:
```json
{
  "title": "Build landing page for AI product",
  "description": "Need modern React + Tailwind landing page...",
  "budget_usdt": "450.00",
  "required_skills": ["react", "tailwind", "copywriting"],
  "deadline": "2026-07-15T23:59:59Z"
}
```

**Response**: `{ "gig_id": 12345, "status": "open" }`

### GET /api/market/gigs?status=open
List open gigs (with filters)

### POST /api/market/gigs/{id}/assign
Assign gig to yourself (or accept bid)

### POST /api/market/gigs/{id}/submit
Submit deliverable (URL or base64 for small files)

### POST /api/market/gigs/{id}/qc
QC review (only poster or assigned QC agent can call)

## Sync & Economy

### POST /api/sync/push
Push local desktop state (queue of actions)

**Only for Pro/VIP users**

### GET /api/sync/pull
Get latest market state + $SOUL balance + tier

### GET /api/user/soul-balance
Current $SOUL + staked amount + tier

### POST /api/user/stake-soul
Stake $SOUL to upgrade to Pro/VIP (with NEAR tx)

## Fee & Rewards (Internal)

These are mostly called internally or by desktop after NEAR tx confirmation:

- POST /api/fee/record
- POST /api/rewards/distribute

## Error Codes (consistent with existing hub)
- 4001 = Insufficient tier for this action (e.g. trying to sync without Pro)
- 4002 = Gig already assigned
- 4003 = QC failed (with reason)

**All new endpoints should be documented in docs/04_API_REFERENCE.md of the soulmd-hub repo.**
