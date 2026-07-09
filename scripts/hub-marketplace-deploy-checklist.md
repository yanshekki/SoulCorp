# SoulCorp Hub Marketplace — Production Deploy Checklist

**Target:** https://soulmd-hub.ysk.hk  
**Hub repo:** https://github.com/yanshekki/soulmd-hub  
**SoulCorp repo:** https://github.com/yanshekki/SoulCorp  

Deploy hub marketplace and desktop hub client together. Run sections in order.

---

## 0. Pre-deploy (local)

- [ ] Hub submodule at marketplace commit `b5e07c5` or later
- [ ] SoulCorp main at `cbe1a16` or later (offline sync + tier fixes)
- [ ] `bash scripts/run-hub-marketplace-smoke.sh` passes
- [ ] `cd soulcorp-desktop/src-tauri && cargo check` passes
- [ ] Note current production baseline (expect `market-gigs.php` → 404 before deploy)

```bash
cd /path/to/SoulCorp
git pull origin main
git submodule update --init --recursive
bash scripts/run-hub-marketplace-smoke.sh
```

---

## 1. Push code

### 1a. soulmd-hub submodule

```bash
cd hub/soulmd-hub
git push origin main
# Expected: includes b5e07c5 "Fix SoulCorp marketplace parity before production deploy"
```

### 1b. SoulCorp parent (bumps submodule pointer)

```bash
cd ../..   # SoulCorp root
git push origin main
# Expected: includes cbe1a16 "Fix hub marketplace offline sync and tier alignment"
```

---

## 2. Production server — pull & files

On the soulmd-hub host (PHP + MySQL):

- [ ] Pull latest `main` from `yanshekki/soulmd-hub`
- [ ] Confirm these files exist under `public_html/api/`:

| File | Purpose |
|------|---------|
| `market-gigs.php` | List / create gigs |
| `market-gig-assign.php` | Accept gig |
| `market-gig-start.php` | Start work (`in_progress`) |
| `market-gig-submit-qc.php` | Submit QC + `deliverable_url` |
| `market-gig-reject-qc.php` | Reject QC |
| `market-gig-dispute.php` | Open dispute |
| `market-gig-complete.php` | Complete + ledger |
| `market-gig-cancel.php` | Cancel open gig (poster) |
| `sync-pull.php` | Desktop pull sync |
| `sync-push.php` | Desktop push + queue processor |
| `user-soul-balance.php` | $SOUL + tier |
| `user-stake-soul.php` | Stake upgrade |

- [ ] `private/src/SoulCorpHub.php` updated (tier merge, `processSyncQueue`, `cancelGig`)
- [ ] `public_html/marketplace.php` has **AgentFi Souls / SoulCorp Gigs** tabs
- [ ] PHP opcache cleared or PHP-FPM reloaded after deploy

```bash
# Example (adjust paths to your host)
cd /var/www/soulmd-hub
git pull origin main
sudo systemctl reload php8.2-fpm   # or your PHP version
```

---

## 3. Database migration

Run on production MySQL. Safe to re-run (`CREATE TABLE IF NOT EXISTS`).

```bash
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  < private/sql/20260630_soulcorp_marketplace.sql
```

### 3a. Existing installs — add `in_progress` status

If `gigs` table already exists from an earlier deploy, run:

```sql
ALTER TABLE gigs
  MODIFY status ENUM(
    'open','assigned','in_progress','in_qc','completed','disputed','cancelled'
  ) DEFAULT 'open';
```

- [ ] Tables exist: `gigs`, `gig_assignments`, `platform_transactions`, `user_tiers`, `sync_logs`
- [ ] `gigs.status` ENUM includes `in_progress`

Verify:

```sql
SHOW TABLES LIKE 'gigs';
SHOW COLUMNS FROM gigs LIKE 'status';
SELECT COUNT(*) FROM user_tiers;
```

### 3b. Tier backfill (one-time, optional)

Sync existing PayPal/NEAR premium users into `user_tiers`:

```sql
INSERT INTO user_tiers (user_id, tier, soul_balance, expires_at)
SELECT u.id, u.tier, 0, u.vip_expires_at
FROM users u
WHERE u.tier IN ('pro', 'vip')
  AND u.vip_expires_at > NOW()
  AND NOT EXISTS (SELECT 1 FROM user_tiers ut WHERE ut.user_id = u.id);

UPDATE user_tiers ut
JOIN users u ON u.id = ut.user_id
SET ut.tier = u.tier, ut.expires_at = u.vip_expires_at, ut.updated_at = NOW()
WHERE u.tier IN ('pro', 'vip')
  AND u.vip_expires_at > NOW()
  AND (
    ut.tier = 'free'
    OR (u.tier = 'vip' AND ut.tier = 'pro')
  );
```

---

## 4. Smoke test (production)

Set your hub base URL, then run the verifier:

```bash
export HUB_BASE_URL="https://soulmd-hub.ysk.hk"
bash scripts/verify-hub-marketplace-deploy.sh
```

Manual checks:

- [ ] `GET /api/market-gigs.php?status=open` → `200` + JSON `{ "success": true, "gigs": [...] }`
- [ ] `GET /marketplace.php?tab=gigs` → SoulCorp Gigs tab renders (empty list OK)
- [ ] Authenticated `GET /api/sync-pull.php` (Bearer API key) → `200` + `tier`, `open_gigs`
- [ ] Authenticated `POST /api/sync-push.php` with `{ "queue": [] }` → `200` (no tier gate)

```bash
# Public list (no auth)
curl -sS "$HUB_BASE_URL/api/market-gigs.php?status=open" | head -c 400

# Authenticated pull (replace KEY)
curl -sS -H "Authorization: Bearer YOUR_API_KEY" \
  "$HUB_BASE_URL/api/sync-pull.php" | head -c 400
```

---

## 5. Desktop client verification

On a machine with SoulCorp desktop built from latest main:

- [ ] **Settings → Hub:** base URL = `https://soulmd-hub.ysk.hk`, API key set
- [ ] **Sync with hub** succeeds (no 404 / tier mismatch)
- [ ] **Marketplace → Browse gigs** loads (or shows empty)
- [ ] **Post a gig** → appears in hub list + web `?tab=gigs`
- [ ] Accept → start → submit QC → complete (or dispute/reject) — hub DB rows update
- [ ] User with NEAR/PayPal Pro/VIP sees correct tier fee (8% / 5%) after sync

Offline queue (optional):

- [ ] Disconnect network → post gig → reconnect → sync → gig created on hub

---

## 6. Rollback plan

If production breaks:

1. Revert soulmd-hub on server: `git checkout <previous-commit> && reload php-fpm`
2. Marketplace APIs are additive — old AgentFi `/api/souls` flow unaffected
3. Desktop falls back to cached gigs when hub unreachable (no data loss locally)
4. DB rollback not required unless bad migration; new tables can remain empty

Record rollback commit before deploy:

```bash
cd hub/soulmd-hub && git rev-parse HEAD
```

---

## 7. Post-deploy

- [ ] Post short release note: hub marketplace live, desktop sync required for gigs
- [ ] Monitor PHP error log for `SoulCorpHub migration warning`
- [ ] Watch `sync_logs` table for failed queue items (`errors` in push response)
- [ ] Schedule follow-up: on-chain payout / escrow (not in this deploy)

---

## Quick reference — API contract

Desktop expects paths under `/api/` (not `/api/gigs/{id}` REST style). Full lifecycle:

```
GET  /api/market-gigs.php?status=open
POST /api/market-gigs.php
POST /api/market-gig-assign.php      { "gig_id": N }
POST /api/market-gig-start.php       { "gig_id": N }
POST /api/market-gig-submit-qc.php   { "gig_id": N, "qc_score": {...}, "deliverable_url": "..." }
POST /api/market-gig-reject-qc.php   { "gig_id": N, "qc_notes": "..." }
POST /api/market-gig-dispute.php     { "gig_id": N, "qc_notes": "..." }
POST /api/market-gig-complete.php    { "gig_id": N }
POST /api/market-gig-cancel.php      { "gig_id": N }
GET  /api/sync-pull.php
POST /api/sync-push.php              { "queue": [ { "type": "gig_create", ... }, ... ] }
GET  /api/user-soul-balance.php
```

Queue `type` values: `gig_create`, `gig_assign`, `gig_start`, `gig_qc_submit`, `gig_complete`, `gig_reject_qc`, `gig_dispute`.

---

## Related scripts

| Script | When |
|--------|------|
| `scripts/run-hub-marketplace-smoke.sh` | Pre-deploy (local PHP tests) |
| `scripts/verify-hub-marketplace-deploy.sh` | Post-deploy (production HTTP checks) |
| `scripts/run-hub-dev.sh` | Local hub dev server |
| `scripts/public-beta-checklist.md` | Desktop app release (separate from hub deploy) |