# ANIMPIPE-004: Stagger/parallel sequencing support

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

Animation sequencing should support more than strict append-only playback so multi-card deals and simultaneous visual events can overlap when configured.

## Assumption Reassessment (2026-02-21)

### Confirmed in current code

1. `packages/runner/src/animation/timeline-builder.ts` already groups consecutive same-kind descriptors and applies per-kind sequencing policies.
2. `packages/runner/src/animation/animation-types.ts` already defines `AnimationSequencingMode` and `AnimationSequencingPolicy`.
3. `packages/runner/src/config/visual-config-types.ts` already supports `animations.sequencing` with `mode` and optional `staggerOffset`.
4. `packages/runner/src/config/visual-config-provider.ts` already exposes `getSequencingPolicy()` and maps config `staggerOffset` to runtime `staggerOffsetSeconds`.
5. `packages/runner/src/animation/animation-controller.ts` already builds and passes sequencing policies to `buildTimeline`.
6. `packages/runner/test/animation/timeline-builder.test.ts` already covers sequential/parallel/stagger/mixed sequencing behavior at timeline-builder level.

### Discrepancies in prior ticket text

1. Prior "What to Change" described initial implementation tasks that are now already complete.
2. Prior acceptance wording "parallel group starts at time 0" was too strict; implementation uses GSAP relative positioning (`'<'`), so parallel items share the same start as the first item in their group, not necessarily absolute timeline `0`.
3. Prior acceptance wording "stagger overlap" was imprecise; implementation uses `'<+=N'`, meaning each item starts `N` seconds after prior group-start anchor.
4. Prior test plan omitted explicit validation for provider policy mapping and controller pass-through of sequencing policies.

## Architecture Reassessment

1. Current direction is aligned with clean/extensible architecture: sequencing remains data-driven in visual config and timeline-builder stays generic.
2. Using GSAP position parameters (`'<'`, `'<+=N'`) is preferable to custom timing math and reduces bespoke orchestration code.
3. No aliasing/back-compat layer is required for sequencing modes; schema and runtime names are explicit and stable.
4. Remaining architectural concern is confidence boundaries (provider mapping + controller integration), not core design.

## Updated Scope (Remaining Work)

### 1. Strengthen sequencing verification at config/provider boundary

- Add/extend tests for `VisualConfigProvider.getSequencingPolicy()`:
  - Returns `null` when no policy exists.
  - Returns mapped runtime policy with `staggerOffsetSeconds` when configured.

### 2. Strengthen sequencing verification at controller boundary

- Add/extend tests for `createAnimationController()`:
  - Passes `sequencingPolicies` into `buildTimeline` when config provides them.
  - Leaves `buildTimeline` options undefined when no policies are configured.

### 3. Validate full runner suite

- Run targeted and package-level runner tests and typecheck.

## Files to Touch

- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/animation/animation-controller.test.ts` (modify)
- `tickets/ANIMPIPE-004.md` (modify)

## Out of Scope

- Reworking timeline sequencing algorithm (already implemented and accepted architecture)
- Preset-specific animation implementation details
- Per-game visual config YAML authoring

## Acceptance Criteria

### Tests That Must Pass

1. Timeline-builder sequencing tests remain green (sequential/parallel/stagger/mixed).
2. Provider test validates sequencing policy retrieval + field mapping.
3. Controller test validates sequencing policy pass-through behavior.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Type check: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Default behavior without sequencing config remains append-sequential.
2. Sequencing policy source of truth remains visual-config data only.
3. Runner animation pipeline remains generic (no game-specific branches).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-provider.test.ts` — add sequencing policy mapping tests.
2. `packages/runner/test/animation/animation-controller.test.ts` — add sequencing policy pass-through tests.

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/config/visual-config-provider.test.ts packages/runner/test/animation/animation-controller.test.ts packages/runner/test/animation/timeline-builder.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-21
- What changed:
  - Reassessed and corrected ticket assumptions/scope to reflect that sequencing runtime implementation already existed.
  - Added provider-level sequencing policy tests in `packages/runner/test/config/visual-config-provider.test.ts`.
  - Added controller pass-through sequencing policy test in `packages/runner/test/animation/animation-controller.test.ts`.
- Deviations from original plan:
  - Did not re-implement sequencing runtime logic because it was already present and aligned with the target architecture.
  - Focus shifted to confidence/coverage gaps at provider/controller boundaries.
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
