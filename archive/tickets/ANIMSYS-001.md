# ANIMSYS-001: Animation Module Foundation + GSAP Setup

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: None

## Problem

Spec 40 requires a dedicated animation subsystem entrypoint and GSAP/PixiPlugin bootstrap. The runner currently has no animation module skeleton, so downstream work (descriptor mapping, timeline construction, queueing, controls) has no stable integration point.

## Assumption Reassessment (2026-02-18)

1. `packages/runner/src/animation/` does not exist yet, so this ticket is still the correct starting point.
2. `gsap` is not currently declared in `packages/runner/package.json`, and this environment may be offline during implementation; foundation code must therefore avoid hard process-global import side effects and support explicit runtime bootstrap.
3. Kernel `EffectTraceEntry` payload keys are canonical (`from`, `to`, `zone`, `type`, etc.); descriptor contracts in this foundation should avoid lossy renaming/aliasing.
4. Existing canvas/store animation gate semantics already exist (`animationPlaying` + canvas-updater deferral). This ticket must not change those semantics.

## File List (Expected)

- `packages/runner/src/animation/gsap-setup.ts` (new)
- `packages/runner/src/animation/animation-types.ts` (new)
- `packages/runner/src/animation/index.ts` (new)
- `packages/runner/test/animation/gsap-setup.test.ts` (new)
- `packages/runner/test/animation/animation-types.test.ts` (new)
- `tickets/ANIMSYS-001.md` (update)

## Implementation Notes

- Use explicit bootstrap (`configure`/`get`) rather than import-time side effects.
- Ensure `PixiPlugin` registration/default configuration executes at most once per process.
- If bootstrap is called with a different runtime instance after initialization, fail fast (single-runtime invariant).
- Export a shared GSAP runtime accessor used by later tickets.
- Define the full `AnimationDescriptor` discriminated union and supporting option types from Spec 40 D2, with canonical field naming aligned to kernel trace payloads.
- Keep this ticket limited to contracts/bootstrap; no trace mapping or timelines yet.

## Out of Scope

- No trace-to-descriptor conversion logic.
- No queue/controller/store wiring.
- No UI components.
- No per-game visual config registration (Spec 42).

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/gsap-setup.test.ts`
2. `packages/runner/test/animation/animation-types.test.ts`
3. `packages/runner/test/canvas/layers.test.ts` (regression: effects layer contract unaffected)
4. `packages/runner/test/canvas/GameCanvas.test.ts` (regression: canvas runtime still initializes)
5. `packages/runner/test/canvas/canvas-updater.test.ts` (regression: animationPlaying gating semantics unchanged)

### Invariants That Must Remain True

1. Animation code remains game-agnostic (no hardcoded game/card/action identifiers).
2. No changes to engine packages or kernel trace schemas.
3. Existing canvas layer ordering (`effectsGroup` present and non-interactive) is unchanged.
4. Importing animation module has no side effects that mutate store state.
5. Animation foundation remains explicit-bootstrap and single-runtime deterministic.

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added animation foundation module surface:
    - `packages/runner/src/animation/gsap-setup.ts`
    - `packages/runner/src/animation/animation-types.ts`
    - `packages/runner/src/animation/index.ts`
  - Added tests:
    - `packages/runner/test/animation/gsap-setup.test.ts`
    - `packages/runner/test/animation/animation-types.test.ts`
  - Updated this ticket with assumption/scope corrections.
- **Deviations from original plan**:
  - GSAP bootstrap is implemented as explicit runtime configuration APIs (single-runtime invariant) instead of import-time global side effects.
  - Descriptor contracts use canonical trace-shaped fields (`from`, `to`, `zone`, `type`) to avoid aliasing and lossy mapping.
  - No package dependency changes were made in this ticket.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/gsap-setup.test.ts test/animation/animation-types.test.ts test/canvas/layers.test.ts test/canvas/GameCanvas.test.ts test/canvas/canvas-updater.test.ts` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
