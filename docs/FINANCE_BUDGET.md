# Finance & Token Economy

**Last updated: July 2026**

## Overview

SoulCorp uses a **unified token economy** (not separate USDT + compute tracks). The company holds a **token pool** allocated to department and agent wallets. AI meetings, scrum execution, and agent runs **charge tokens**; starvation throttles agents. The **Tokens** page (CEO step 8) is the primary finance UI.

Legacy salary and budget allocation systems remain for simulation flavor and payroll projection.

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| Token economy state | ✅ | `state` — `TokenEconomy` |
| Company pool | ✅ | `token_budget::total_company_tokens` |
| Dept / agent wallets | ✅ | `DepartmentTokenWallet`, `AgentTokenWallet` |
| Period limits (weekly/monthly/…) | ✅ | `token_budget/mod.rs` period reset |
| Charge on AI usage | ✅ | `charge_tokens`, `ChargeContext` |
| Usage ledger | ✅ | `get_token_usage_ledger` |
| Allocate / rebalance | ✅ | `allocate_*_tokens_cmd`, `rebalance_token_wallets_cmd` |
| Budget update per dept/agent | ✅ | `update_*_token_budget_cmd` |
| Enforcement / starvation | ✅ | `apply_enforcement`, agent `throttled` status |
| Finance tick (salary) | ✅ | `finance/mod.rs`, `run_simulation_tick` |
| Budget allocations % | ✅ | `update_budget_allocations` |
| Agent salary adjust | ✅ | `adjust_agent_salary` |
| Command center burn metrics | ✅ | `command_center.rs` — pool, monthly_burn |
| Cost estimates | ✅ | `estimate_meeting_turn_cost`, `estimate_work_execution_cost` |
| Frontend Tokens page | ✅ | `TokensPage.tsx` |
| Legacy finance panel | ✅ | `FinancePanel.tsx`, `get_finance_state` |

---

## Architecture

### Wallet hierarchy

```
Company token pool
├── Department wallets (optional period caps)
│   └── Agent wallets (optional period caps)
└── Unallocated reserve
```

### Charge sources (`TokenUsageSource`)

Meetings, scrum execution, god mode powers, and other AI calls record usage entries in the ledger.

### Simulation payroll

`projected_monthly_payroll` = sum(agent salaries) + per-agent overhead. Displayed in command center alongside token burn.

### Starvation behavior

When pool is depleted or wallet over limit:

- Agents may enter `throttled` status
- Execution runs may fail or queue
- Command center raises alerts

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| USDT on-chain payroll | NEAR/$SOUL is hub/tier layer; in-game unit is tokens |
| Multi-currency display | Single token denomination in UI |
| AI-predicted burn forecasting | VIP foresight is event-level, not finance ML |
| Tax / fee reports | Not implemented locally |

---

## Related docs

- [PRO_VIP_SYSTEM.md](PRO_VIP_SYSTEM.md)
- [MEETING_SYSTEM.md](MEETING_SYSTEM.md)
- [PROJECTS_SCRUM.md](PROJECTS_SCRUM.md)
- [GOD_MODE.md](GOD_MODE.md)