# SOULMD_HUB_EXTENSION_PLAN.md
**Extending Existing soulmd-hub for SoulCorp Marketplace & Economy**

**Target Repo**: https://github.com/yanshekki/soulmd-hub

## Philosophy
We do **not** create a new backend. We extend the existing, battle-tested soulmd-hub (PHP + MySQL + NEAR + Web3 auth) with the minimum necessary features for the game economy.

This keeps maintenance low, reuses existing NEAR contract (soulmd-hub.near), auth, NFT soul system, and user base.

## New Database Tables (add to private/sql/)

```sql
-- Gigs / Marketplace
CREATE TABLE gigs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    poster_user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    budget_usdt DECIMAL(18,8) NOT NULL,
    status ENUM('open','assigned','in_qc','completed','disputed','cancelled') DEFAULT 'open',
    required_skills JSON,
    deadline DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (poster_user_id) REFERENCES users(id)
);

-- Gig Assignments & QC
CREATE TABLE gig_assignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gig_id BIGINT UNSIGNED NOT NULL,
    assignee_user_id BIGINT UNSIGNED NOT NULL,
    status ENUM('assigned','submitted','qc_passed','qc_rejected') DEFAULT 'assigned',
    deliverable_url TEXT,
    qc_score JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gig_id) REFERENCES gigs(id),
    FOREIGN KEY (assignee_user_id) REFERENCES users(id)
);

-- Platform Transactions & Fee
CREATE TABLE platform_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gig_id BIGINT UNSIGNED,
    from_user_id BIGINT UNSIGNED,
    to_user_id BIGINT UNSIGNED,
    amount_usdt DECIMAL(18,8),
    fee_usdt DECIMAL(18,8),
    fee_soul DECIMAL(18,8),
    tx_hash VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Tiers (Pro / VIP)
CREATE TABLE user_tiers (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    tier ENUM('free','pro','vip') DEFAULT 'free',
    soul_staked DECIMAL(18,8) DEFAULT 0,
    expires_at DATETIME,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## New PHP Controllers (public_html/controllers/)

1. **MarketplaceController.php**
   - createGig()
   - listOpenGigs()
   - bidOnGig() / acceptBid()
   - submitDeliverable()
   - qcReview()

2. **SyncController.php**
   - pushDesktopState() (for Pro/VIP users)
   - pullMarketUpdates()
   - getSoulBalance()

3. **FeeController.php**
   - calculateAndRecordFee()
   - distributeSoulRewards()

4. **VipController.php**
   - checkTier()
   - stakeSoulForVip()
   - getBenefits()

## NEAR Smart Contract Changes (contract/)

- Add fee splitting logic (10% total)
- $SOUL reward distribution on gig completion
- Optional: soulmd-hub.near already handles NFT souls — reuse for "SoulCorp Verified Company" badges

## Integration Points with Desktop (Tauri)
- All marketplace actions go through existing Web3 signature flow
- Desktop calls `https://soulmd-hub.ysk.hk/api/market/...`
- Sync uses same libsodium + Ed25519 verification already in place

## rollout Plan
1. Add new tables (migration script)
2. Add 4 new controllers + routes
3. Extend NEAR contract (or handle fee logic in PHP + near-api-js first for speed)
4. Update frontend (existing soulmd-hub web) to show "SoulCorp Gig Marketplace" tab
5. Document new API endpoints in docs/04_API_REFERENCE.md

**This extension is minimal, safe, and fully backward compatible with existing soulmd-hub users and features.**
