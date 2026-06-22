# AGENT_SYSTEM.md
**AI Employees — The Heart of SoulCorp**

## How Agents Work
Every agent is a real LLM instance loaded with:
- `SOUL.md` (core personality, values, communication style) — from soulmd-hub
- `STYLE.md` + `RULES.md` (optional)
- Current memory + compressed summary
- Department SOP + company vision
- Personal relationships graph with other agents

### AI API Connection
Agents 呼叫 LLM 嘅邏輯由 Tauri Rust 後端統一管理（見 `TAURI_DESKTOP_SPEC.md` → AI Provider Abstraction）。

支援多種 AI Provider：
- 本地模型（Ollama, vLLM 等）
- 常見雲端 provider（OpenAI, Claude, Grok 等）
- **soulmd-hub API**（特別支援）：
  - `POST https://soulmd-hub.ysk.hk/api/chat`
  - `POST https://soulmd-hub.ysk.hk/api/self-chat`

玩家可以喺設定入面為每個 agent 或整個公司選擇用邊個 AI Provider。

## Agent Daily Life (Simulated)
- Wake up → check tasks + mood
- Walk to assigned department (visible in isometric view)
- Collaborate with teammates (real multi-agent conversations)
- Take breaks, chat in lounge, form relationships
- Report progress at end of day
- Can get burnout, inspiration, or drama

## Agent Stats (Visible)
- Skill levels (per department)
- Morale / Burnout
- Energy
- Relationship network
- Reputation in company
- Innovation score

## Special Agent Behaviors (Emergence)
- Can fall in love / form rivalries
- Propose new project ideas
- Request better tools / model upgrade
- Mentor junior agents
- Unionize if morale is too low
- "Retire" and become a legendary mentor (legacy SOUL.md)

## Hiring Flow
1. Open soulmd-hub marketplace inside the game
2. Browse real SOUL.md personas (filter by skill, price, vibe)
3. "Interview" them (real chat with the agent)
4. Negotiate salary (in $SOUL or USDT)
5. Onboard → they appear in your office the next day

**Agents are not just numbers — they feel alive because they run on real LLMs with persistent personality.**
