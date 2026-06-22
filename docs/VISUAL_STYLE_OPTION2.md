# VISUAL_STYLE_OPTION2.md
**Stardew Valley × Pokémon Legends Isometric Style (Locked)**

## Art Direction
- **Core Vibe**: Cozy, charming, slightly magical management sim
- **Perspective**: True 45° isometric (not fake 2.5D)
- **Color Palette**: Warm earth tones + soft pastels (Stardew) mixed with vibrant accent colors for agents and UI (Pokémon)
- **Lighting**: Soft global illumination + gentle shadows (Three.js)
- **Pixel + Low-poly Hybrid**: Pixel textures on buildings/agents + clean low-poly ground and props

## Technical Implementation (Three.js)
- OrthographicCamera with proper isometric rotation
- Tilemap system (32×32 or 64×64 tiles)
- InstancedMesh for 200+ agents (huge performance win)
- LOD system:
  - Close: full pixel sprite + animation
  - Medium: simplified mesh
  - Far: billboard icon only
- Post-processing stack:
  - Subtle CRT / pixel filter (optional, user toggle)
  - Soft bloom on UI elements and agent status bubbles
  - vignette for cozy feel

## World Layout
1. **Player Company Building** (main hub)
   - Multiple floors (click to zoom into department)
   - Rooftop garden / chill area
2. **Hub Plaza** (global marketplace area)
   - Other player companies visible (read-only or visit if friends)
   - Gig board physical object in world
3. **Agent Housing / Park** (for idle agents, relationships, drama events)

## Agent Representation
- Cute pixel sprites (different outfits per department/role)
- Status bubbles above head: "Coding...", "In Meeting", "Burnout 😩"
- Walking + idle animations (simple but charming)
- When working: subtle particle effects (code particles, money, hearts for morale)

## UI / HUD Philosophy
- Minimal floating UI (Game Boy inspired)
- Main menu = classic game pause menu style
- Sidebar = modern clean (for KPIs, agent list, queue status)
- Notifications = toast + in-world speech bubbles

## Accessibility & Performance
- Toggleable pixel filter (for low-end devices)
- Colorblind-friendly palettes
- 60 FPS target on integrated graphics
- Graceful degradation (disable shadows/particles on low power)

**This style gives strong "game" feeling while remaining professional enough for actual business simulation use.**
