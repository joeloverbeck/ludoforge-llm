# FRONTEND-F3-003: Complete Card-Capable Token Rendering and Hidden-Source Card Animation Resilience

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: No (runner rendering/animation runtime)
**Deps**: FRONTEND-F3-001, FRONTEND-F3-002

## Assumption Reassessment (2026-02-19)

The original ticket assumed multiple card-animation primitives were missing. Code/test audit shows this is only partially true.

### Already Implemented (Do Not Rebuild)

1. Card semantic descriptor mapping already exists:
   - `moveToken` -> `cardDeal`/`cardBurn` and `setTokenProp` -> `cardFlip` via `cardAnimation` metadata (`packages/runner/src/animation/trace-to-descriptors.ts`, `packages/runner/src/animation/card-classification.ts`).
2. Preset registry already supports card semantic descriptor kinds without game-ID branching:
   - `arc-tween` is compatible with `cardDeal`/`cardBurn`;
   - `tint-flash` is compatible with `cardFlip` (`packages/runner/src/animation/preset-registry.ts`).
3. Playback control behavior already exists and is tested:
   - reduced motion, pause/resume, skip-current/skip-all, and `animationPlaying` queue gating (`packages/runner/src/animation/animation-controller.ts`, `packages/runner/src/animation/animation-queue.ts`).
4. Token container identity stability across updates already exists and is tested (`packages/runner/test/canvas/renderers/token-renderer.test.ts`).

### Real Gaps

1. Token rendering is still a generic circle+label primitive and does not use token visual hints to render card-like front/back visuals.
2. Timeline sprite guards are too strict for hidden-source deal flows:
   - timeline generation currently requires source zone containers for move/deal/burn descriptors;
   - this can skip otherwise valid card deal/burn tweens when source zone sprites are not available.
3. Hidden-source resilience is not directly covered by timeline tests.

## Problem

Card semantic descriptors exist, but the visual layer still cannot render true card front/back token primitives, and hidden-source deal/burn flows can be skipped due to source-sprite guard strictness rather than intentional degradation policy.

## Updated Scope (Architecture-First)

1. Add token-type-visual-aware token rendering primitives in runner:
   - consume generic token visual metadata (shape/symbol/color) from token type definitions;
   - support a card-capable rendering path with explicit front/back visual states;
   - keep container identity stable for flip tweening.
2. Keep animation semantics generic and data-driven:
   - do not add game-ID branches;
   - do not introduce hardcoded game-specific zone/token identifiers.
3. Fix hidden-source move/deal/burn timeline guards:
   - require only what tween construction truly needs (token container + zone positions), not source zone container presence;
   - allow graceful continuation when source sprites are absent.
4. Preserve existing playback architecture:
   - reduced-motion, pause/resume, skip-current, skip-all, and queue gating behavior must remain unchanged.

## Invariants

1. Animation remains purely visual and never mutates authoritative game state.
2. `animationPlaying` gating behavior remains correct (no deadlock/stuck true).
3. Missing sprites/containers degrade gracefully with warnings and continued playback.
4. Card rendering/animation paths stay generic; no game ID branches.
5. Non-card token rendering behavior remains stable unless configured otherwise via token visual metadata.
6. No backwards-compatibility aliases for replaced renderer contracts in this ticket scope.

## Tests

1. Renderer unit tests:
   - card-shaped token types render deterministic front/back states;
   - face-state transitions update card visuals without container replacement;
   - non-card token rendering remains unchanged.
2. Token visual provider tests:
   - token type visual metadata resolution (shape/color/symbol) remains deterministic.
3. Timeline robustness tests:
   - hidden-source card deal/burn path still constructs tween and completes when positions exist but source zone container is absent.
4. Queue/controller regression tests:
   - existing reduced-motion/pause/resume/skip semantics remain green unchanged.
5. Full runner test subset for touched areas passes.

## Outcome

- **Completed**: 2026-02-19
- **What changed**:
  - Upgraded runner token visual contract from color-only lookup to token visual hint lookup (`shape`/`color`/`symbol`) and propagated this through renderer providers.
  - Implemented card-capable token primitives with stable front/back visual layers in `token-renderer` while preserving existing non-card rendering behavior.
  - Fixed a container-stability bug: non-selectable singleton tokens now keep stable render IDs across face-state transitions.
  - Relaxed timeline move/deal/burn sprite guard policy to require positional metadata rather than source zone container presence, enabling hidden-source card animations when positions exist.
  - Added/updated tests for card visual rendering, provider contracts, and hidden-source deal robustness.
- **Deviation vs original plan**:
  - No new dedicated built-in preset IDs were introduced for card deal/burn/flip because the current generic preset architecture already supports these descriptor kinds cleanly.
  - Scope was corrected to avoid rebuilding already-implemented card semantic mapping and playback control logic.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- test/canvas/renderers/token-renderer.test.ts test/animation/timeline-builder.test.ts test/canvas/renderers/faction-colors.test.ts test/canvas/renderers/renderer-types.test.ts`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
