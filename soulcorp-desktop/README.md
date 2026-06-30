# SoulCorp Desktop

Tauri 2.x desktop client for SoulCorp (Rust backend + React 19 + TypeScript).

## Development

```bash
pnpm install
pnpm verify
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri dev
```

## Phase 0 Scope

- Tauri application scaffold
- Rust command stubs (`agent`, `simulation`, `sync`, `near`)
- Local SQLite initialization via `rusqlite`
- Prisma schema mirror for tooling (`prisma/schema.prisma`)
- Frontend shell layout and placeholder game scene