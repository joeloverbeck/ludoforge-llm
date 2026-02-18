# ANIMSYS-004: Timeline Builder with Graceful Degradation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: archive/tickets/ANIMSYS-002.md, archive/tickets/ANIMSYS-003.md

## Problem

Spec 40 requires conversion of descriptors into sequential GSAP timelines using token/zone containers and zone positions. The runner currently has no timeline builder and no resilience behavior for missing sprites or tween failures.

## Assumption Reassessment (2026-02-18)

1. `packages/runner/src/animation/timeline-builder.ts` does not exist yet; Layer 2 from Spec 40 D4 is still missing.
2. `packages/runner/src/animation/preset-registry.ts` already exists and currently exposes `createTween` hooks as placeholders (`NOOP_TWEEN_FACTORY`), so this ticket should focus on robust sequencing/error handling contracts, not concrete visual tween math.
3. `packages/runner/src/animation/trace-to-descriptors.ts` already enforces preset/descriptor compatibility at mapping time, but timeline build still must be defensive because descriptors can be constructed from other sources (tests/runtime extensions).
4. `ANIMSYS-002` and `ANIMSYS-003` are completed and archived; this ticket depends on those completed outputs rather than active tickets.
5. `packages/runner/test/canvas/renderers/token-renderer.test.ts` and `packages/runner/test/canvas/renderers/zone-renderer.test.ts` are valid regression surfaces for sprite container contracts required by timeline assembly.

## Architecture Reassessment

Adding a dedicated timeline builder boundary is more beneficial than keeping tween assembly ad hoc inside future controller/queue code because it:

- isolates descriptor-to-timeline orchestration from trace mapping and playback state concerns;
- centralizes graceful-degradation policy (missing sprite refs, preset errors, per-descriptor failure isolation);
- preserves strict game-agnostic architecture by delegating visuals to registry presets instead of hardcoded game logic;
- keeps future extension points (custom presets from Spec 42, queue/controller from ANIMSYS-005/006) composable and testable.

This ticket remains intentionally scoped to Layer 2 assembly + resilience behavior. It does not include playback queue/controller wiring.

## File List (Expected)

- `packages/runner/src/animation/timeline-builder.ts` (new)
- `packages/runner/src/animation/preset-registry.ts` (update: strengthen timeline context typing for builder integration)
- `packages/runner/src/animation/gsap-setup.ts` (update: timeline factory typing for runtime contract clarity)
- `packages/runner/src/animation/index.ts` (update export)
- `packages/runner/test/animation/timeline-builder.test.ts` (new)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (regression)
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` (regression)
- `packages/runner/test/canvas/layers.test.ts` (regression)
- `packages/runner/test/animation/gsap-setup.test.ts` (regression if runtime typing contract changes)

## Implementation Notes

- Implement `buildTimeline(descriptors, registry, spriteRefs)` from Spec 40 D4.
- Append descriptor tweens sequentially.
- Ignore `SkippedDescriptor` entries.
- For missing token/zone containers: `console.warn` and continue.
- Catch per-descriptor GSAP failures and continue timeline assembly.
- Prepend `pulse` tween when `isTriggered === true` and preset supports it.

## Out of Scope

- No queueing or playback controls.
- No store subscription/effectTrace orchestration.
- No reduced-motion branch.
- No AI turn policies.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/timeline-builder.test.ts`
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts`
3. `packages/runner/test/canvas/renderers/zone-renderer.test.ts`
4. `packages/runner/test/canvas/layers.test.ts` (regression: effects layer still valid target)
5. `packages/runner/test/animation/gsap-setup.test.ts` (regression: runtime contract still deterministic)

### Invariants That Must Remain True

1. Timeline builder never throws on missing sprite references.
2. Failed descriptor tween generation does not block subsequent descriptors.
3. Timeline order preserves descriptor order.
4. No game-specific animation logic is introduced.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added `packages/runner/src/animation/timeline-builder.ts` with `buildTimeline()` that:
    - builds a GSAP timeline from descriptors in descriptor order;
    - ignores `SkippedDescriptor` entries;
    - warns and skips when required token/zone refs are missing;
    - catches per-descriptor preset/tween failures and continues;
    - prepends `pulse` tween when `isTriggered === true` and pulse is compatible.
  - Updated `packages/runner/src/animation/gsap-setup.ts` runtime typing to include `timeline()` and exported `GsapTimelineLike`.
  - Updated `packages/runner/src/animation/preset-registry.ts` tween context typing so preset factories receive typed timeline/sprite refs.
  - Updated `packages/runner/src/animation/index.ts` to export timeline-builder.
  - Follow-up architecture hardening: `buildTimeline()` now receives `gsap` explicitly instead of reading global runtime state, keeping Layer 2 deterministic and easier to compose/test.
  - Added `packages/runner/test/animation/timeline-builder.test.ts` coverage for ordering, graceful degradation, and per-descriptor error isolation.
  - Updated `packages/runner/test/animation/gsap-setup.test.ts` fixture to satisfy updated runtime timeline contract.
- **Deviations from original plan**:
  - Added a small `gsap-setup` typing contract update not listed in the original ticket text to avoid untyped timeline construction and keep Layer 2 boundaries explicit.
  - Kept built-in preset factories as placeholders; this ticket focuses on orchestration/error handling contracts, leaving concrete visual tween math to later animation tickets.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/timeline-builder.test.ts test/animation/gsap-setup.test.ts test/canvas/renderers/token-renderer.test.ts test/canvas/renderers/zone-renderer.test.ts test/canvas/layers.test.ts` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
