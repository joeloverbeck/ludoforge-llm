# FRONTEND-F3-003: Implement Card-Capable Token Rendering and Flip/Deal/Burn Tweens

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: No (runner rendering/animation runtime)
**Deps**: FRONTEND-F3-001, FRONTEND-F3-002

## Problem

Current token rendering is a generic circle+label primitive and cannot express robust card visuals/flip behavior. Deal/burn moves can also fail to animate from hidden-origin contexts when source containers are unavailable.

## What to Change

1. Add card-capable token rendering primitives in runner:
   - front/back visual representation for card tokens;
   - stable container structure that supports flip tweening without replacing IDs mid-animation.
2. Ensure card visual state (front vs back) is driven by generic metadata/state, not hardcoded game assumptions.
3. Add built-in GSAP preset tweens for:
   - card deal (motion from source role to destination role),
   - card burn (motion to burn/discard role with optional fade),
   - card flip (scale-x collapse/swap/expand or equivalent robust flip animation).
4. Handle hidden-source deal animation gracefully:
   - if source token container is absent, create a transient animation origin using zone position metadata;
   - never block queue progression because a source sprite is missing.
5. Preserve reduced-motion, pause/resume, skip-current, and skip-all semantics.

## Invariants

1. Animation remains purely visual and never mutates authoritative game state.
2. `animationPlaying` gating behavior remains correct (no deadlock/stuck true).
3. Missing sprites/containers degrade gracefully with warnings and continued playback.
4. Card rendering/animation paths stay generic; no game ID branches.
5. Non-card token rendering behavior remains stable unless explicitly configured otherwise.

## Tests

1. Renderer unit tests:
   - card tokens render with front/back variants;
   - face-state transition updates visuals deterministically.
2. Preset registry/timeline builder tests:
   - cardDeal/cardBurn/cardFlip descriptors produce expected tween construction.
3. Timeline robustness tests:
   - hidden-source deal path uses transient origin and still completes.
4. Queue/controller tests:
   - pause/resume/skip/reduced-motion behavior works with card timelines.
5. Regression tests:
   - existing token/zone animation tests pass unchanged.

