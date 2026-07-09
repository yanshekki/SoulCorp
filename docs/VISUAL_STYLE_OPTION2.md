# Campus Visual Style — Option 2

**Last updated: July 2026**

**Stardew Valley × Pokémon Legends isometric style (locked for campus/world)**

Interior offices use a separate spec: `soulcorp-desktop/docs/OFFICE_VISUAL_TARGET.md`.

---

## Overview

The **3D campus** (v2 edition, optional in v1) uses a cozy 45° isometric world: warm palettes, pixel-low-poly hybrid buildings, instanced agent sprites, and zoom-into-building interiors.

---

## Implemented

| Feature | Status | Key paths |
|---------|--------|-----------|
| Isometric Three.js scene | ✅ | `GameScene`, `ThreeOfficeRenderer.tsx` |
| InstancedMesh agents | ✅ | Phase 8 render perf |
| LOD / pixel sprites | ✅ | Agent rendering pipeline |
| Campus + interior views | ✅ | `worldView` in game store |
| Building click zoom | ✅ | Interior sub-scenes |
| Visual design presets | ✅ | `visualDesignClient`, `designPresets.ts` |
| Campus theme packs | ✅ | `officeThemePacks.ts` |
| Low power mode | ✅ | Reduces 3D update cost |
| WebGL pause when inactive | ✅ | Skips render if `activePanel !== "office"` |
| 3D smoke test (CI) | ✅ | `scene3dSmoke.ts`, phase 7 |
| Design studio (v2) | ✅ | `DesignStudioPage`, furniture catalog |

---

## Art direction

| Aspect | Choice |
|--------|--------|
| Perspective | True 45° isometric (`OrthographicCamera`) |
| Palette | Warm earth + soft pastels; vibrant agent accents |
| Agents | Pixel sprites, status bubbles, instanced rendering |
| UI | Game-inspired pause menu + modern management sidebar |

### Performance targets

- 60 FPS on integrated graphics with instancing + LOD
- `low_power_mode` disables heavy shadows/particles
- Optional pixel filter toggle (accessibility / retro feel)

---

## Planned / Gaps

| Item | Notes |
|------|-------|
| Hub plaza multiplayer avatars | Campus is local company |
| Weather / day-night cycle | Static lighting presets |
| Procedural campus expansion | Manual building layout |

---

## Related docs

- `soulcorp-desktop/docs/OFFICE_VISUAL_TARGET.md`
- [TAURI_DESKTOP_SPEC.md](TAURI_DESKTOP_SPEC.md)
- [PERFORMANCE.md](PERFORMANCE.md)