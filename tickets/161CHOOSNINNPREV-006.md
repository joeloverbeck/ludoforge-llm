# 161CHOOSNINNPREV-006: Squared-cost formula + `COST_EXCEEDS_HARD_CAP` diagnostic rename

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/`
**Deps**: `specs/161-choosenstep-inner-preview-integration.md`

## Problem

`lowerPreviewInnerConfig` at `compile-agents.ts:962` enforces a single triple-product cap `maxOptions × chooseNBeamWidth × depthCap ≤ INNER_PREVIEW_HARD_CAP (256)` regardless of which inner-preview flags are set. With Spec 161 wiring up `chooseNStep` to a per-root-option forced continuation beam, the worst-case cost for `chooseNStep: true` profiles is the squared formula `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))` — strictly larger than the triple product when `depthCap ≥ 2`. Without the formula update, an opted-in profile could exceed the runtime hard cap unnoticed at compile time.

The existing diagnostic `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` is named after the obsolete single-formula state. Once the squared branch lands, the name becomes misleading. F#14 mandates a clean rename to `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` with no alias.

## Assumption Reassessment (2026-05-07)

1. `lowerPreviewInnerConfig` exists at `compile-agents.ts:962`; the cost calculation is at line 1017–1018 with the diagnostic emission at line 1020.
2. `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` is registered at `compiler-diagnostic-codes.ts:261`. Migration sites: `compile-agents.ts:1020`, `test/unit/cnl/compile-preview-inner.test.ts:97`. (Verified via grep — only these two source/test sites; archived ticket `archive/tickets/160PEROPTPREV-003.md` references the old name historically and should not be touched.)
3. `INNER_PREVIEW_HARD_CAP = 256` at `compile-agents.ts:81` is unchanged.
4. ARVN profile (post-Ticket 013) opts in with `maxOptions=8, chooseNBeamWidth=1, depthCap=4`; squared = `8 × (1 + 1 × 8 × 3) = 200`, fits under 256. Failure case `8 × 2 × 4` squared = `8 × (1 + 2 × 8 × 3) = 392`, exceeds 256.
5. Pre-Ticket 004, no profile in the repo opts into `preview.inner.chooseNStep: true` (silent no-op state); the formula tightening is observably no-op for current data.

## Architecture Check

1. Conditional formula: `chooseNStep === true` selects the squared branch; otherwise the triple product is used. Profiles that don't opt into `chooseNStep` see no behavioral change in compile-time validation. F#10 honored — bounded computation through tighter static enforcement.
2. F#14 — clean diagnostic rename with no alias. All references update in the same change.
3. Engine-agnostic — compiler validation touches no game-specific identifiers. F#1 honored.
4. The cost formula is a static upper bound: actual runtime cost may be lower if a frontier has fewer than `maxOptions` legal options, but compile time guarantees the worst case fits the hard cap.

## What to Change

### 1. Squared-cost formula — `packages/engine/src/cnl/compile-agents.ts`

Update `lowerPreviewInnerConfig` (around line 1017–1020):

```ts
const cost = chooseNStep === true
  ? loweredMaxOptions * (1 + loweredChooseNBeamWidth * loweredMaxOptions * Math.max(0, loweredDepthCap - 1))
  : loweredMaxOptions * loweredChooseNBeamWidth * loweredDepthCap;

if (!Number.isSafeInteger(cost) || cost > INNER_PREVIEW_HARD_CAP) {
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP,
    path: `${path}.inner`,
    severity: 'error',
    message: `Profile "${profileId}" preview.inner cost ${cost} exceeds INNER_PREVIEW_HARD_CAP ${INNER_PREVIEW_HARD_CAP}.`,
    suggestion: chooseNStep === true
      ? `When chooseNStep is enabled, the per-root-option forced continuation beam costs maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1)). Reduce maxOptions, chooseNBeamWidth, or depthCap.`
      : `Set maxOptions × chooseNBeamWidth × depthCap to ${INNER_PREVIEW_HARD_CAP} or less.`,
  });
}
```

### 2. Diagnostic rename — `packages/engine/src/cnl/compiler-diagnostic-codes.ts:261`

Rename the constant key and string value from `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` to `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP`. No alias.

### 3. Update existing test assertion — `packages/engine/test/unit/cnl/compile-preview-inner.test.ts:97`

Update the diagnostic-code string assertion from `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` to `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP`. No other test logic change.

### 4. New unit test `packages/engine/test/unit/cnl/compile-preview-inner-choosenstep-cost.test.ts`

`architectural-invariant`. Asserts:

- ARVN-like config (`maxOptions=8, chooseNBeamWidth=1, depthCap=4, chooseNStep: true`) compiles without error (squared = 200 ≤ 256).
- Failure config (`maxOptions=8, chooseNBeamWidth=2, depthCap=4, chooseNStep: true`) fails compilation with diagnostic code `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` and a message containing the computed cost (392).
- A profile with `chooseNStep: false` and high values (`maxOptions=4, chooseNBeamWidth=4, depthCap=4`, triple = 64) continues to use the triple-product formula and compiles cleanly.
- The renamed diagnostic still fires for triple-product overflow cases (e.g., `maxOptions=8, chooseNBeamWidth=8, depthCap=8, chooseNStep: false`, triple = 512 > 256).

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — squared-cost branch + diagnostic-code reference rename at line 1020)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — rename constant at line 261)
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (modify — update assertion at line 97 to renamed code)
- `packages/engine/test/unit/cnl/compile-preview-inner-choosenstep-cost.test.ts` (new — `architectural-invariant`)

## Out of Scope

- Compile-time warning extension to `chooseNStep` — Ticket 005.
- Runtime adapter, dispatch, and integration tests — Tickets 003–004, 007–011.
- Cookbook update — Ticket 012.

## Acceptance Criteria

### Tests That Must Pass

1. New: ARVN-like (`8, 1, 4, chooseNStep: true`) compiles cleanly under squared formula.
2. New: over-budget (`8, 2, 4, chooseNStep: true`) fails with `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` and computed cost 392.
3. New: `chooseNStep: false` profile uses the triple-product formula (no breakage of existing chooseOne-only profiles).
4. New: triple-product overflow case still fires the renamed diagnostic.
5. Existing test (`compile-preview-inner.test.ts:97`) passes after assertion update.
6. Existing engine suite: `pnpm -F @ludoforge/engine test`.
7. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For `chooseNStep: true`, the worst-case static cost respects `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1)) ≤ INNER_PREVIEW_HARD_CAP`.
2. (architectural-invariant) For `chooseNStep: false`, the triple-product formula is applied unchanged.
3. The diagnostic code `CNL_COMPILER_AGENT_PREVIEW_INNER_TRIPLE_PRODUCT_EXCEEDED` no longer exists; `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` replaces it (F#14 — no alias).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-preview-inner-choosenstep-cost.test.ts` (new) — `architectural-invariant`. Squared-cost formula validation.
2. `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (modify) — update diagnostic-code string at line 97.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/compile-preview-inner-choosenstep-cost.test.js`
2. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/compile-preview-inner.test.js`
3. `pnpm turbo schema:artifacts`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
6. `pnpm -F @ludoforge/engine test`
