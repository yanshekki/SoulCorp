# SoulCorp Coding Standards

## Rust (Tauri backend)

- Run `cargo fmt` before committing; `cargo clippy` should pass without new warnings.
- Tauri commands live in `src-tauri/src/commands/`; register every command in `lib.rs`.
- Blocking I/O and subprocess calls use `tokio::task::spawn_blocking` inside `async` commands.
- Persist state changes through `db::persistence::commit` after mutating `AppState`.
- VIP/feature gates use `tier::can_use_feature`; never hard-code tier strings in UI-only checks.

## TypeScript / React (frontend)

- Run `pnpm typecheck` and `pnpm build` via `pnpm verify` before merge.
- Shared types belong in `src/types/`; invoke wrappers in `src/services/`.
- Zustand store (`gameStore`) holds simulation snapshot; avoid duplicating hub/tier state in component state.
- Prefer `invoke<T>()` with typed results; surface errors through `setStatusMessage`.

## Project layout

- `docs/` — specifications (do not delete without team agreement).
- `scripts/verify-phase.sh N` — phase gate; extend when adding phase features.
- `hub/soulmd-hub/` — git submodule; hub API changes need matching PHP endpoints.

## Commits

- Use conventional prefixes: `feat`, `fix`, `chore`, `docs`.
- Reference phase number in commit body when closing a phase milestone.