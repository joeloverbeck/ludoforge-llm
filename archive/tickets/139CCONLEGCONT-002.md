## 139CCONLEGCONT-002: chooseN set-variable propagation infrastructure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module (set-variable propagation) + reuse of existing `runWitnessSearch`
**Deps**: `specs/139-constructibility-certificate-legality-contract.md`

## Problem

Spec 139's D3 replaces raw subset enumeration over `chooseN{min, max}` heads with bounded set-variable propagation. On the live failing witness (FITL `march` template, `chooseN{min:1, max:27, options:27}`, powerset ≈ 134M), raw subset enumeration exceeds `maxParamExpansions` budget and the classifier returns `'unknown'`. Set-variable propagation (lower bound `lb`, upper bound `ub`, cardinality constraint `min ≤ |S| ≤ max`) plus per-option include/exclude support tests cuts the search space to the arc-consistent subset — the same technique constraint programming uses for bounded set-variable CSPs.

This ticket delivers the propagation machinery as a standalone pure function. The module composes with the existing `runWitnessSearch` per-option witness infrastructure in `choose-n-option-resolution.ts`. The classifier (003) will wire it in as the `supportedSelections(request, move, ctx)` substrate in the memoized DFS. T2 tests propagation rules on hand-authored synthetic shapes plus the adversarial `min:1, max:27, options:27` mirror of the live FITL witness.

## Assumption Reassessment (2026-04-19)

1. `runWitnessSearch`, `WitnessSearchBudget`, and `ChooseNDiagnosticsAccumulator` all exist in `packages/engine/src/kernel/choose-n-option-resolution.ts` (756 lines) at lines 637, 432, 66 respectively — confirmed via grep. The existing per-option witness search is the correct substrate to compose over.
2. `enumerateChooseNSelections` in `decision-sequence-satisfiability.ts:46` is the raw-subset-enumeration helper being displaced; it is called once from `forEachDecisionSelection` at line 109. The propagation module is introduced as a NEW export alongside it; 003 will rewire the call site and delete the old helper.
3. `MoveEnumerationBudgets` (`move-enumeration-budgets.ts`) provides `maxParamExpansions: 100_000` and `maxDecisionProbeSteps: 128` as the existing bounds — propagation reuses these, no new budget constant.

## Architecture Check

1. **Pure, deterministic, bounded.** The propagation algorithm terminates in `O(|options| × witnessSearchBudget)` per `chooseN` request — bounded by the existing `WitnessSearchBudget`, not a new constant (Foundation #10). Canonical option order is preserved for reproducibility (Foundation #8).
2. **Engine-agnostic.** Set-variable propagation operates on generic `ChoicePendingRequest.chooseN` shapes; no per-game logic (Foundation #1).
3. **Composes with existing substrate.** Reuses `runWitnessSearch` for per-option include/exclude support tests rather than duplicating the witness-search machinery. Foundation #15.
4. **No shims.** New module, additive. Old `enumerateChooseNSelections` stays intact in this ticket and is deleted in 003 as part of the classifier rewrite (atomic cut within 003, not split across tickets).

## What to Change

### 1. Create `packages/engine/src/kernel/choose-n-set-variable-propagation.ts`

Export `propagateChooseNSetVariable(request, move, ctx)` returning a `ChooseNPropagationResult`:

```ts
type ChooseNPropagationResult =
  | { kind: 'unsat' }                                    // |lb| > max, |ub| < min, or all branches fail
  | { kind: 'determined'; selection: readonly MoveParamScalar[] }  // lb fixed the selection
  | { kind: 'branching'; candidateSelections: readonly (readonly MoveParamScalar[])[] };
                                                         // branch canonically on residual ub \ lb
```

Algorithm (per spec D3):

1. Initialize `lb = []`, `ub = request.options`.
2. For each option `x` in canonical order: run `runWitnessSearch` twice — once with `x ∈ S` forced, once with `x ∉ S` forced. If `x ∈ S` has no witness → remove `x` from `ub`. If `x ∉ S` has no witness → add `x` to `lb`.
3. Cardinality propagation:
   - `|lb| > max` → return `{ kind: 'unsat' }`.
   - `|ub| < min` → return `{ kind: 'unsat' }`.
   - `|lb| == max` → return `{ kind: 'determined', selection: lb }`.
   - `|ub| == min` → return `{ kind: 'determined', selection: ub }`.
4. If not determined, select the most constrained remaining choice (smallest residual `ub \ lb`) and return `{ kind: 'branching', candidateSelections: [...] }` with inclusion-first canonical ordering.
5. Propagation halts as soon as one branch is exhausted — no eager enumeration of the full branch set.

Reuses `WitnessSearchBudget`, `ChooseNDiagnosticsAccumulator`, and the probe-cache infrastructure from `choose-n-option-resolution.ts`.

### 2. New T2 unit test

File: `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts`

File-top marker: `// @test-class: architectural-invariant`.

Assertions:

- For `(lb, ub, min, max)` tuples with known witness shapes, assert the 4 propagation rules (D3 step 3) produce the expected reductions — one assertion per rule.
- For `chooseN{min:1, max:3, options:5}` with 2 witnesses (one forced-include, one forced-exclude), assert the propagation returns the union of support.
- Adversarial case: `chooseN{min:1, max:27, options:27}` on a synthetic GameDef mirroring the FITL `march` witness shape. Assert the propagation returns a `determined` or `branching` result within `MoveEnumerationBudgets` and does not exhaust `maxParamExpansions`. Record the probe-step count for comparison against the classifier-overhead gate in T9 (ticket 008).
- Canonical order invariant: propagation with `options` permuted internally produces byte-identical `candidateSelections` after canonical re-ordering.

## Files to Touch

- `packages/engine/src/kernel/choose-n-set-variable-propagation.ts` (new)
- `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify export surface)

## Out of Scope

- Wiring the propagation into the classifier — ticket 003.
- Deletion of `enumerateChooseNSelections` — ticket 003 (atomic cut when `forEachDecisionSelection` is rewritten).
- Cross-call memoization of propagation results — ticket 003 (memoization is classifier-level).
- `CompletionCertificate`-shaped return value — this module returns selections, not certificates; the classifier assembles certificates from selections.

## Acceptance Criteria

### Tests That Must Pass

1. New T2 unit test passes under `pnpm -F @ludoforge/engine test:unit`.
2. Adversarial `min:1, max:27, options:27` case completes within `MoveEnumerationBudgets` defaults.
3. Existing `choose-n-option-resolution` tests remain green — the new module is additive, does not modify `runWitnessSearch`.
4. Full suite: `pnpm turbo test` green.

### Invariants

1. Propagation is pure: no mutation of `move`, `request`, `options`, or `ctx` (Foundation #11).
2. Output is deterministic over input: identical `(request, move, ctx)` → identical `ChooseNPropagationResult`.
3. Bounded: total `runWitnessSearch` invocations capped by `WitnessSearchBudget`; propagation itself adds no unbounded iteration (Foundation #10).
4. `candidateSelections` are emitted in canonical order — byte-identical across runs regardless of option iteration order.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts` — T2 per spec § Testing Strategy; propagation rules + adversarial shape + canonical-order invariant.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit` — targeted.
2. `pnpm turbo test` — full suite.
3. `pnpm turbo lint && pnpm turbo typecheck` — gates.

## Outcome

- Added `packages/engine/src/kernel/choose-n-set-variable-propagation.ts` with a standalone pure propagation surface over `ChoicePendingChooseNRequest`, reusing the existing singleton-probe and witness-search infrastructure from `choose-n-option-resolution.ts`.
- Added `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts` covering the four D3 cardinality reductions, supported-union branching behavior, the adversarial 27-option shape, and the canonical-order invariant.
- Added the public export wiring in `packages/engine/src/kernel/index.ts` so the new propagation surface is reachable through the kernel barrel.
- `ticket corrections applied`: `runWitnessSearch-only wording -> live implementation reuses both runSingletonProbePass and runWitnessSearch through a local propagation context built on the real probe/classification seam`
- `ticket deviation`: the adversarial T2 proof bounds the synthetic 27-option shape via counted classifier invocations and warning absence, but it does not persist a standalone probe-step artifact; the durable cross-ticket comparison remains owned by `tickets/139CCONLEGCONT-008.md`.
- `verification set`: `pnpm -F @ludoforge/engine build` -> `pnpm -F @ludoforge/engine test:unit` -> `pnpm turbo lint` -> `pnpm turbo typecheck` -> `pnpm turbo test`
- `proof gaps`: `none`
