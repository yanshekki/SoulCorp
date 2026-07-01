# Office Visual Target — Sims × Two Point Hospital

**Default theme pack: `StartupWarm`**

Interior offices use a dedicated sub-style: cozy low-poly game readability (Sims build mode) with playful clarity (Two Point Hospital). Campus/world keeps `VISUAL_STYLE_OPTION2` isometric style; only **interior rooms** follow this document.

---

## Design pillars

| Pillar | Sims influence | Two Point influence |
|--------|----------------|---------------------|
| Silhouette | Recognisable furniture at a glance | Exaggerated proportions, clear zones |
| Surface | Wood, fabric, warm materials | Bold accent bands, trim, props |
| Light | Soft fill, window glow | High readability, no muddy corners |
| Mood | Homey startup loft | Light humour, not clinical |

**Not in scope:** photoreal PBR, CAD-accurate dimensions, freeform architecture (Phase 4).

---

## Theme packs

| ID | Label | Use case |
|----|-------|----------|
| **startup_warm** (default) | Startup Warm | HQ, plaza — wood floors, cream walls, gold accent |
| corporate_cool | Corporate Cool | Engineering — cool grey, blue accent |
| clinical_playful | Clinical Playful | HR / park — mint + coral TPH vibe |

### StartupWarm (default)

```
Floor (wood):     #c9a882  → boosted render #d4b896
Walls (cream):    #f5f0e8  → #faf6ef
Accent (honey):   #e8a838  → emissive trim #ffd166
Lighting:         warm
Desk default:     open
Decor flags:      plants on, whiteboard on, lounge off
```

**Floor tile:** oak planks, 1m repeat, slight variation (Phase B3)  
**Wall:** matte plaster, baseboard in accent  
**Window:** warm `#ffe8c8` emissive, opacity 0.75 (not 0.5 — reduces blue haze)

### CorporateCool

```
Floor:   #9aa3ad
Walls:   #e8ecf0
Accent:  #5ec8ff
Lighting: cool
```

### ClinicalPlayful

```
Floor:   #b8d4c8
Walls:   #f0f8f5
Accent:  #ff8a7a
Lighting: natural
```

---

## Asset specs (Phase B2 target)

| Asset | Tris budget | Texture | Notes |
|-------|-------------|---------|-------|
| Desk | 800–1200 | 512 KTX2 wood top + metal legs | Clear top surface for monitor |
| Chair | 600–900 | 512 fabric + plastic | Readable back rest |
| Sofa | 1000–1400 | 512 fabric | Rounded arms |
| Plant | 400–700 | 512 alpha pot + leaves | 2 LOD not required in Phase 1 |
| Monitor | 300–500 | 256 screen emissive | Screen glow in scene |
| Reception | 1200–1600 | 512 laminate | Counter height obvious |
| Whiteboard | 200–400 | 256 white + frame | Wall-mounted |
| Floor lamp | 400–600 | 256 metal + emissive shade | |

**Material slots (GLTF):** `wood`, `fabric`, `metal`, `plastic`, `accent`, `emissive_screen`

**Fallback:** procedural box GLTF from `generate-furniture-gltf.mjs` until authored asset lands.

---

## Lighting presets

### studioClarity (design studio)

- Fog: off
- SSAO: on (Phase B4)
- Bloom: 0.12 strength max
- Ambient: 0.78
- Key: warm `#fff0d8`, intensity 1.2
- Zone points: 1.1 intensity, 18m range

### playCozy (in-game interior)

- Cozy post pipeline optional (user setting)
- Wall fade min opacity 0.22
- Same base lights as studioClarity + optional bloom

---

## Camera

| Mode | Camera | Framing |
|------|--------|---------|
| Build | Orthographic isometric | Full office footprint |
| Walk (Phase 2) | Perspective 42° FOV | Room focus, wall peel |
| Render (Phase 3) | Perspective + SSAO | Static screenshot |

---

## 2D plan parity (Phase A)

- Furniture silhouettes generated from same GLTF top-down projection
- Grid: 0.25m fine / 1m coarse
- Dimensions label on selection: `W × D m`

---

## Polygon & performance budget

- Interior scene: **< 80k tris** (Phase 1), **< 150k** (Phase 2 full catalog)
- Furniture instances: **< 200** per office
- Target: **60 FPS** @ 1080p integrated GPU in design studio

---

## Acceptance (Phase 1)

1. Default new office uses `startup_warm` theme pack
2. 2D and 3D furniture count/position/rotation match
3. 8 core props use authored textures (or documented fallback)
4. No distance fog; walls opaque in design studio
5. Subjective Sims/TPH game feel ≥ 7/10 internal review