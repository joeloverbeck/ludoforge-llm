# 164CONTPREVDEP-002: Compiler — strategy/capClass lowering, per-phase cost validation, diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `kernel/types-core.ts` (extend compiled config types), `cnl/compile-agents.ts` (extend lowering + cost validation), `cnl/compiler-diagnostic-codes.ts` (new diagnostic codes)
**Deps**: `archive/tickets/164CONTPREVDEP-001.md`

## Problem

The compiler currently parses `preview.inner` into a 5-field `CompiledAgentPreviewInnerConfig` and validates a single-pass cost against `INNER_PREVIEW_HARD_CAP`. Spec 164 introduces:

- A `strategy` field (`singlePass` | `continuedDeepening`) with `singlePass` default
- A `capClass` field (`standard256` | `deep1024`) with `standard256` default
- A `continuedDeepening` block (broad/deep depth caps, triggers, root policy)
- A per-phase cost formula with budget enforcement against `CAP_CLASS_BUDGETS`
- Three new diagnostic codes for unknown values, depth-cap mismatch, and per-phase cost overruns

This ticket lands all compiler-side work for Phase 1 and regenerates compiled-JSON fixtures whose `previewInner` blocks gain the new `capClass` field.

## Assumption Reassessment (2026-05-09)

1. `CompiledAgentPreviewInnerConfig` lives in `packages/engine/src/kernel/types-core.ts:895-901` (5 fields, all `readonly`). Confirmed by reassessment of spec 164.
2. `lowerPreviewInnerConfig` in `packages/engine/src/cnl/compile-agents.ts:978-1056` is the single lowering site for `preview.inner` and the place to extend.
3. Existing diagnostic codes for inner preview are at `packages/engine/src/cnl/compiler-diagnostic-codes.ts:259-261`. New codes append to the same registry following the same naming convention.
4. The single cost-formula site is `compile-agents.ts:1033-1035`. Continued-deepening adds a per-phase formula alongside without replacing the single-pass branch.
5. `previewInner` literal references in compiled-JSON fixtures: only `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` references the field by name. Most usage is inferred from the YAML pipeline, so fixture regeneration scope is small.

## Architecture Check

1. **Compiler-Kernel boundary preserved (F#12)**: All cost validation, strategy/capClass parsing, and depth-cap consistency checks happen at compile time. The kernel does not see invalid configurations.
2. **Default-on-absent preserves byte-identical singlePass behavior (F#14)**: Profiles that omit `strategy` default to `singlePass`; profiles that omit `capClass` default to `standard256`. The single-pass cost formula is unchanged for these profiles. No compatibility shim — defaults are first-class.
3. **Single source of truth (F#15)**: Cap-class budgets come from `CAP_CLASS_BUDGETS` (Ticket 001); the compiler never duplicates the literal numbers. Per-phase formula references the same `M, B, I, Db, Dd` symbols spec §5.2 defines.
4. **Domain-typed identifiers (F#17)**: `strategy` and `capClass` are union-of-literals, validated at lowering time before flowing into the compiled artifact.

## What to Change

### 1. Extend compiled config types

In `packages/engine/src/kernel/types-core.ts:895-901`, extend `CompiledAgentPreviewInnerConfig`:

```ts
export interface CompiledAgentPreviewInnerConfig {
  readonly chooseOne: boolean;
  readonly chooseNStep: boolean;
  readonly maxOptions: number;
  readonly chooseNBeamWidth: number;
  readonly depthCap: number;
  readonly strategy: 'singlePass' | 'continuedDeepening';   // NEW; defaults to 'singlePass'
  readonly capClass: 'standard256' | 'deep1024';            // NEW; defaults to 'standard256'
  readonly continuedDeepening?: ContinuedDeepeningConfig;   // NEW; required iff strategy === 'continuedDeepening'
}

export interface ContinuedDeepeningConfig {
  readonly broad: { readonly depthCap: number };
  readonly deep: {
    readonly depthCap: number;
    readonly trigger: readonly DeepTrigger[];
    readonly rootPolicy: 'allRootsWithinCap';
  };
}

export type DeepTrigger =
  | 'allRequestedRefsDepthCapped'
  | 'allReadyValuesUniform';
```

Add `PolicyPreviewPhaseCoverage` either here or in `policy-eval.ts` alongside `PolicyPreviewCoverage` (whichever is more coherent — `PolicyPreviewCoverage` lives in `policy-eval.ts:199-206` so the phase block belongs there). This ticket adds the type definition only; runtime population is Ticket 004.

### 2. Add new diagnostic codes

In `packages/engine/src/cnl/compiler-diagnostic-codes.ts`, append three codes:

- `CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_STRATEGY`
- `CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_CAP_CLASS`
- `CNL_COMPILER_AGENT_PREVIEW_DEEP_COST_EXCEEDS_CAP_CLASS`
- `CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH`

(Four total codes — the spec §7.1 names two unknown-value codes plus one depth-cap mismatch and one cost overrun.)

### 3. Extend `lowerPreviewInnerConfig`

In `packages/engine/src/cnl/compile-agents.ts:978-1056`, add lowering for `strategy`, `capClass`, and the optional `continuedDeepening` block. Preserve all existing validation paths.

Validation rules (per spec §5.2 and §7):

- Unknown `strategy` → `CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_STRATEGY`.
- Unknown `capClass` → `CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_CAP_CLASS`.
- `strategy === 'continuedDeepening'` requires the `continuedDeepening` block; missing block → `CNL_COMPILER_AGENT_PREVIEW_INNER_INVALID` (existing code, with a specific message).
- `continuedDeepening.broad.depthCap` and `continuedDeepening.deep.depthCap` are positive integers.
- `deep.depthCap >= broad.depthCap`.
- `trigger` is a non-empty array of known `DeepTrigger` values.
- `rootPolicy === 'allRootsWithinCap'` (only supported value in this spec).
- Top-level `depthCap === broad.depthCap` (legacy field consistency); mismatch → `CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH`.
- Single-pass: existing formula `cost = M × (1 + B × M × max(0, D − 1))` for `chooseNStep === true`; reject if `cost > CAP_CLASS_BUDGETS[capClass]`. Reuse the existing `CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP` code; update its message to reference `capClass` rather than the bare `INNER_PREVIEW_HARD_CAP`.
- Continued-deepening per spec §5.2:
  - `broadCost = M × (1 + B × I × max(0, Db − 1))` where `I = M`.
  - `incrementalDeepCost = R × B × I × max(0, Dd − Db)` where `R = M` (rootPolicy: allRootsWithinCap).
  - `totalCost = broadCost + incrementalDeepCost`.
  - Reject if `totalCost > CAP_CLASS_BUDGETS[capClass]` with `CNL_COMPILER_AGENT_PREVIEW_DEEP_COST_EXCEEDS_CAP_CLASS`. Diagnostic message includes `M, B, I, Db, Dd, broadCost, incrementalDeepCost, totalCost, capClass, breachAmount`.

The lowered config records `strategy`, `capClass`, and the optional `continuedDeepening` block in the compiled artifact, satisfying spec §7.6.

### 4. Compiled-JSON fixture regeneration

Regenerate any pinned compiled-JSON fixtures whose `previewInner` blocks gain the new `capClass` field. Confirmed scope: any test that compiles a profile and snapshots the output will see the new field on first re-run.

Run the engine build and a full test pass; inspect snapshot diffs for previewInner blocks. Update them to include `capClass: "standard256"` (the default) or the explicit YAML-declared value.

### 5. Compiler test additions

- `continued-deepening-cost-rejection.test.ts` — `(M=8, B=2, Db=4, Dd=16)` totalCost=1928 rejected with `CNL_COMPILER_AGENT_PREVIEW_DEEP_COST_EXCEEDS_CAP_CLASS`; `(M=8, B=1, Db=4, Dd=16)` totalCost=968 compiles under `deep1024`. Diagnostic message contains formula inputs and breach amount.
- `continued-deepening-depthcap-mismatch.test.ts` — top-level `depthCap !== broad.depthCap` rejected with `CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH`.
- `unknown-strategy-and-capclass-rejected.test.ts` — strategy values other than `singlePass`/`continuedDeepening` and capClass values other than `standard256`/`deep1024` rejected with their respective diagnostics.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify) — extend `CompiledAgentPreviewInnerConfig`, add `ContinuedDeepeningConfig`, add `DeepTrigger`.
- `packages/engine/src/agents/policy-eval.ts` (modify) — add `PolicyPreviewPhaseCoverage` type definition (population in Ticket 004).
- `packages/engine/src/cnl/compile-agents.ts` (modify) — extend `lowerPreviewInnerConfig`; add per-phase cost validation; consume `CAP_CLASS_BUDGETS`.
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify) — append 3 new diagnostic codes.
- `packages/engine/test/cnl/continued-deepening-cost-rejection.test.ts` (new)
- `packages/engine/test/cnl/continued-deepening-depthcap-mismatch.test.ts` (new)
- `packages/engine/test/cnl/unknown-strategy-and-capclass-rejected.test.ts` (new)
- Pinned compiled-JSON fixtures with `previewInner` blocks (modify) — paths discovered during fixture regeneration; expected impact is small (single golden fixture per the assumption reassessment).

## Out of Scope

- Strategy dispatch in the runtime (Ticket 003).
- Deep-pass driver implementation (Ticket 004).
- Per-phase coverage population (Ticket 004 — type added here, runtime fields populated there).
- Cookbook updates (Ticket 005).

## Acceptance Criteria

### Tests That Must Pass

1. Three new compiler tests pass.
2. Existing compiler suite: `pnpm -F @ludoforge/engine test` (no regressions in singlePass profiles).
3. Round-trip: profiles that omit `strategy`/`capClass` compile to identical bytes as before this ticket *except* for the addition of `previewInner.capClass: "standard256"` on outputs that include `previewInner`.
4. `pnpm turbo typecheck && pnpm turbo lint`.

### Invariants

1. `singlePass` profiles produce a `CompiledAgentPreviewInnerConfig` with `strategy: 'singlePass'` and `capClass: 'standard256'` defaulted in.
2. `continuedDeepening` profiles fail compilation if any §7 validation rule is violated.
3. The single-pass cost formula at `compile-agents.ts:1033-1035` is unchanged for `singlePass` profiles.
4. No game-specific identifier appears in any new diagnostic message or type — all new code is engine-agnostic (F#1).
5. `CAP_CLASS_BUDGETS` is the only source of cap-class budget literals in the compiler.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/cnl/continued-deepening-cost-rejection.test.ts` — compiler-test class; both pass and reject cases; asserts message inputs.
2. `packages/engine/test/cnl/continued-deepening-depthcap-mismatch.test.ts` — compiler-test class; asserts the depth-cap mismatch diagnostic.
3. `packages/engine/test/cnl/unknown-strategy-and-capclass-rejected.test.ts` — compiler-test class; covers both unknown-value diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/cnl/continued-deepening-cost-rejection.test.js packages/engine/dist/test/cnl/continued-deepening-depthcap-mismatch.test.js packages/engine/dist/test/cnl/unknown-strategy-and-capclass-rejected.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
