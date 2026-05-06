# 157PREVBUDBALCOV-002: Phase B — Compiler-side EffectFootprint and structural-impact prior

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — new `compile-effect-footprint.ts` module; existing `compile-effects-*.ts` emit footprints; `policy-evaluation-core.ts` types; allocator prior-pass scoring in `policy-eval.ts`
**Deps**: `archive/tickets/157PREVBUDBALCOV-001.md`

## Implementation Outcome (2026-05-06)

**Closeout state**: implemented in code; terminal proof passed on 2026-05-06.

Phase B landed as compiler-emitted conservative footprint metadata and allocator-side structural impact ranking:

- Added `EffectFootprint` metadata on compiled `EffectAST` nodes, with schema support in the generated GameDef/Trace effect schemas.
- Added `compile-effect-footprint.ts` for deterministic footprint derivation, unioning, preview-read footprint derivation, and integer-only `structuralImpactScore`.
- Emitted footprints from the existing compiled-effect wrappers, including nested lowered effect arrays.
- Added `readFootprint` to compiled policy/agent considerations and regenerated the policy-catalog goldens.
- Exposed action-effect footprints through `PolicyEvaluationCore.getActionEffectFootprint`.
- Updated the preview-budget allocator's prior-fill pass to rank by `priorScore * structuralImpactScore`, while leaving Phase A coverage ordering unchanged.
- Updated JSON Schema artifact generation to use reusable `$ref` definitions and exact effect `_k` literals, preserving footprint schema support without producing AJV stack overflows on production-sized Texas GameDefs.

Semantic corrections against the draft ticket:

- The live compiled-effect type is `EffectAST`; the ticket's `CompiledEffect` wording maps to that live type.
- The live allocator integration point is `preview-budget-allocator.ts`, called from `policy-eval.ts`, not an inline `for c in priorRanked` block inside `policy-eval.ts`.
- The spec's one-line `priorScore + structuralImpactScore` mention was treated as stale; this ticket's multiplicative `priorScore * structuralImpactScore` acceptance text is authoritative.
- The generated fallout includes `packages/engine/schemas/Trace.schema.json` as well as `GameDef.schema.json`, because trace schemas embed the GameDef effect schema.

Diagnostic FITL utility probe:

- Command shape: production FITL, seeds `1..10`, `maxTurns=5`, `PolicyAgent({ traceLevel: 'summary' })`, `fullCandidateCap` at production default.
- Result: `decisions=2797`, `none=1731`, `constant=628`, `lowInformation=69`, `differentiating=369`.
- Interpreted rate: `369/2797` over all policy decisions, or `369/1066` over preview-active decisions excluding `none`.
- This is diagnostic successor input for ticket 003, not a terminal acceptance gate for Phase B. The denominator differs from Phase A's archived 29-decision sampled corpus, so it is not recorded as a direct green/red replacement for that sample.

Source-size/runtime-surface ledger:

- New footprint logic lives in `compile-effect-footprint.ts`; active edits to existing large compiler/schema files stayed surgical.
- Preexisting file-size risk remains in `compile-agents.ts`/schema surfaces; this ticket did not add new compiler-agent bulk.
- Runtime surface breadth: policy/agent-only for allocator behavior, shared GameDef/Trace schema metadata for footprint serialization.

Final proof lanes:

- `pnpm run check:ticket-deps` — passed before status flip; rerun after status flip passed.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/preview-effect-footprint.test.js dist/test/unit/agents/preview-budget-allocator.test.js` — passed, 14 tests across 2 suites.
- `pnpm turbo schema:artifacts` — passed; regenerated `GameDef.schema.json`, `Trace.schema.json`, and `EvalReport.schema.json`.
- `pnpm -F @ludoforge/engine test` — passed, default lane summary `64/64 files passed`.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — passed, 5 successful tasks.

Verification substitution:

- The drafted `pnpm -F @ludoforge/engine test:unit -- agents/...` command does not filter Node test files in the live package script; it runs the entire `dist/test/unit/**/*.test.js` glob and passes `agents/...` as test-runner args. The owned focused witness is therefore the direct compiled Node-test command above. The broad `pnpm -F @ludoforge/engine test` lane remains in the final proof set.

## Problem

Phase A's `allocatePreviewBudget` prior pass uses raw move-only score to fill remaining slots after coverage. This is a placeholder — it cannot distinguish between candidates whose effects demonstrably touch the preview ref's read footprint (impactful) and candidates whose effects don't (no-ops for preview purposes). Without structural impact, candidates with similar move-only scores but vastly different state-change footprints get equal preview consideration, wasting budget on candidates whose preview will trivially project to identity.

Phase A live evidence also showed that balanced coverage by itself does not satisfy the original FITL differentiating-rate target: the sampled corpus produced 1/29 differentiating decisions at `fullCandidateCap: 4`, and forcing caps up to 64 only reached 4/29. Phase B must treat that red utility evidence as residual input when proving whether structural-impact prior improves the still-constant projections; if the metric remains red after structural-impact prior, ticket 003 owns the bounded widening response.

Phase B adds a compiler-side conservative effect-footprint analysis. Each compiled effect carries `EffectFootprint = { writes, reads, mayTouchTokens, mayTouchZones, mayTouchVariables, mayTouchScores }`. Preview refs get a parallel `readFootprint` derived from declared dependencies. The allocator's prior pass computes `structuralImpactScore = |writes ∩ previewRef.readFootprint|` and combines it multiplicatively with `priorScore`.

Conservative under-approximation only: false positives waste preview time (acceptable — they erode the optimization but preserve correctness), false negatives recreate the Phase A circular-gate failure mode (unacceptable). Branches with dynamic targets (e.g., `zone-by-binding`) mark `mayTouchZones: 'unknown'`, treated as universal-touch.

## Assumption Reassessment (2026-05-06)

1. **No existing `readFootprint` infrastructure** (per `/reassess-spec` 2026-05-06): grep for `readFootprint` in `packages/engine/src/` returns no matches. Phase B is purely new infrastructure.
2. **Existing effect-compilation files** (verified by structural agent): `compile-effects-core.ts`, `compile-effects-choice.ts`, `compile-effects-token.ts`, `compile-effects-var.ts`, `compile-effects-flow.ts`, `compile-effects-free-op.ts`, `compile-effects-utils.ts`, `compile-effects-binding-scope.ts`, `compile-effects-types.ts`. Each will need a footprint-emitting helper.
3. **No existing AST-walk pattern for footprint extraction**: Phase B introduces the pattern. The closest existing analog is consideration evaluation (which walks but does not produce a typed footprint). Implementer should design the walker to be reusable for future analyses (e.g., Spec 159 completion-policy guidance).
4. **`priorScore × structuralImpactScore` is integer-safe**: both are integers (priorScore from move-only sum, structuralImpactScore from set-intersection cardinality). No floating-point arithmetic introduced (F#8).
5. **Phase A's prior pass already exists** (delivered by ticket 001): the integration point is the `for c in priorRanked` block in `allocatePreviewBudget`. Phase B replaces the sort key from `priorScore desc` to `(priorScore × structuralImpactScore) desc`.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** Conservative under-approximation is the F#15-aligned choice: false negatives recreate Gap 2 (preview-needed candidates gated out before observation), so the design must err toward over-allocation. Compared to two-pass shallow + full preview (rejected — ~2× cost when shallow doesn't disambiguate), this captures the same signal (ref-write intersection) without an extra simulation pass.
2. **GameSpecDoc vs runtime boundary preserved.** `EffectFootprint` operates on AST node kinds (`tokenMove`, `varSet`, `scoreAdjust`, etc.) — generic over GameDef shapes (F#1). Footprints are derived from compiled IR statically (F#7 — no eval, no runtime callbacks). Preview refs declare their dependencies in YAML; the compiler computes their `readFootprint` from those declarations.
3. **No backwards-compatibility shims (F#14).** No previous footprint mechanism existed; Phase B is purely additive at the type level. The allocator's prior-pass change is in-place — no parallel "old prior" code path.
4. **Determinism (F#8).** Footprint computation is deterministic given the compiled IR. Set-intersection cardinality is integer-safe. Multiplicative combination with `priorScore` is integer arithmetic. Allocator continues to use codepoint-compare tie-break (no `localeCompare`).

## What to Change

### 1. New module — `packages/engine/src/cnl/compile-effect-footprint.ts`

Define and export:

```typescript
type EffectFootprint = {
  writes: {
    tokens: TokenTypeId[] | 'unknown';
    zones: ZoneId[] | 'unknown';
    variables: VariableId[] | 'unknown';
    scores: ScoreId[] | 'unknown';
  };
  reads: { /* same shape */ };
  mayTouchTokens: TokenTypeId[] | 'unknown';
  mayTouchZones: ZoneId[] | 'unknown';
  mayTouchVariables: VariableId[] | 'unknown';
  mayTouchScores: ScoreId[] | 'unknown';
};

function computeEffectFootprint(effect: CompiledEffect): EffectFootprint;
```

The walker dispatches on `effect.kind` and produces a footprint. Conservative defaults: any branch whose target is dynamic (e.g., `zone-by-binding`, `tokens-where-condition`) marks the corresponding field `'unknown'`. Effect composition (sequence, conditional) unions sub-effect footprints.

### 2. Effect compilation integration

Each `compile-effects-*.ts` file contributes its footprint emission for the effect kinds it handles. The footprint travels alongside the compiled effect AST (added field on `CompiledEffect`). No behavioral change at compile time other than the new field.

### 3. Preview ref `readFootprint`

Extend the preview-ref declaration in YAML with implicit `readFootprint` derivation. The compiler computes `readFootprint` from the ref's declared dependencies (parameters, state features, candidate features) and stores it on the compiled `PreviewRef`. The runtime reads `readFootprint` directly — no recomputation.

### 4. Allocator integration — `allocatePreviewBudget` prior pass

Replace the prior-pass sort key in `allocatePreviewBudget`:

```
// Phase A:
priorRanked = sort(remaining, by priorScore desc, stableMoveKey asc)

// Phase B:
priorRanked = sort(remaining, by (priorScore × structuralImpactScore) desc, stableMoveKey asc)
where structuralImpactScore(candidate) =
  candidate.effect.footprint.writes ∩ previewRef.readFootprint cardinality
  + 1  // ensure unimpactful candidates still rank by raw priorScore
```

The `+ 1` floor preserves Phase A's behavior when no candidate has structural impact (e.g., refs whose footprint cardinality is universal-`'unknown'`). `'unknown'` × any → treated as max-impact (preserves conservatism).

### 5. Conservative-footprint property test

For every action in the FITL action corpus, the footprint must mark every variable/zone/token the action's compiled effect can demonstrably write — no false-negatives in a hand-checked sample. Property test reads the FITL action set, enumerates each action's compiled effect, and asserts the footprint is a superset of every demonstrable write computed by an oracle (a separate, slower full-AST traversal that ignores conservatism shortcuts).

## Files to Touch

- `packages/engine/src/cnl/compile-effect-footprint.ts` (new — footprint type + walker)
- `packages/engine/src/cnl/compile-effects-core.ts` (modify — emit footprint)
- `packages/engine/src/cnl/compile-effects-choice.ts` (modify — emit footprint)
- `packages/engine/src/cnl/compile-effects-token.ts` (modify — emit footprint)
- `packages/engine/src/cnl/compile-effects-var.ts` (modify — emit footprint)
- `packages/engine/src/cnl/compile-effects-flow.ts` (modify — emit footprint)
- `packages/engine/src/cnl/compile-effects-free-op.ts` (modify — emit footprint)
- `packages/engine/src/cnl/compile-effects-types.ts` (modify — `CompiledEffect` gains `footprint: EffectFootprint` field)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — types for `EffectFootprint`, exposed for allocator consumption)
- `packages/engine/src/agents/policy-eval.ts` (modify — allocator prior pass uses `priorScore × structuralImpactScore`)
- `packages/engine/src/cnl/compile-agents.ts` (modify — preview-ref compiler computes `readFootprint`)
- `packages/engine/test/unit/agents/preview-effect-footprint.test.ts` (new — conservativeness property test)
- `packages/engine/test/unit/agents/preview-budget-allocator.test.ts` (modify — extend with structural-impact prior fixtures)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (modify — re-bless with footprint fields)
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json` (modify — re-bless with footprint fields)

## Out of Scope

- **Phase C — Widen-on-uniform**: ticket 003.
- **Spec 159 — Preview policy-guided completion**: footprint may be reused there but is not authored for that purpose here.
- **Action footprint as a runtime contract**: the footprint is metadata used only by the allocator and (future) completion policy. No runtime legality checks consume it.
- **Optimization of the walker**: brute-force is acceptable in Phase B. If profiling shows compile-time regression, optimize in a follow-up.

## Acceptance Criteria

### Tests That Must Pass

1. New: On a fixture where candidate X's effect writes to a variable in the preview ref's read footprint and candidate Y's effect doesn't, X is selected by the prior pass when both are out of the coverage minimum and have equal `priorScore`.
2. New: `EffectFootprint` is conservative over the FITL action corpus — for every action, the footprint marks every variable the action's compiled effect can demonstrably write (no false-negatives in a hand-checked sample).
3. New: Footprint computation is deterministic — compiling the same GameSpec twice produces byte-identical footprints on every compiled effect.
4. New: `'unknown'` footprint values are treated as universal-touch in `structuralImpactScore` (preserves conservatism).
5. New: `structuralImpactScore = 1 + (writes ∩ readFootprint).cardinality`; the `+ 1` floor ensures candidates with zero structural impact still rank by raw `priorScore`.
6. Existing: Phase A's coverage invariant still holds (group coverage is unaffected by Phase B — only the prior pass changes).
7. Diagnostic: Rerun the sampled FITL utility-rate probe after structural-impact prior and record whether the Phase A residual differentiating rate improved; if it remains materially red, classify the remaining constant-projection problem as Phase C-owned.
8. Existing engine suite: `pnpm -F @ludoforge/engine test`.
9. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) `EffectFootprint` is conservative — for every action, the union of `writes` ∪ `mayTouch*` is a superset of every variable/zone/token/score the action's compiled effect can demonstrably modify.
2. (architectural-invariant) `'unknown'` footprint propagates: any composition with an `'unknown'`-marked sub-effect produces `'unknown'`.
3. (architectural-invariant) `structuralImpactScore` is integer-only (no floating-point introduced).
4. (architectural-invariant) Allocator output size ≤ `fullCandidateCap` (unchanged from Phase A — Phase B does not change the cap).
5. (architectural-invariant) Compile determinism: footprints are byte-identical across two compiles of the same GameSpec.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-effect-footprint.test.ts` (new) — `architectural-invariant`. Conservativeness property test over the FITL action corpus; deterministic-compile property; `'unknown'` propagation; oracle-comparison for hand-checked samples.
2. `packages/engine/test/unit/agents/preview-budget-allocator.test.ts` (modify — extend) — `architectural-invariant`. Add structural-impact-prior fixtures: candidates with equal `priorScore` but differing `structuralImpactScore` are ordered correctly; `+ 1` floor preserves Phase A behavior on impact-zero corpora.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/preview-effect-footprint`
2. `pnpm -F @ludoforge/engine test:unit -- agents/preview-budget-allocator`
3. `pnpm turbo schema:artifacts`
4. `pnpm turbo lint typecheck test`

## Outcome

Completed: 2026-05-06

- Landed Phase B compiler-emitted conservative `EffectFootprint` metadata on compiled effects, including schema support and generated `GameDef`/`Trace`/`EvalReport` schema artifacts.
- Added deterministic footprint derivation, preview-read footprint derivation, footprint unioning, and integer-only structural-impact scoring in `compile-effect-footprint.ts`.
- Wired action-effect footprints and consideration `readFootprint` data into policy evaluation, then updated the preview-budget allocator prior pass to rank by `priorScore * structuralImpactScore` while preserving Phase A coverage ordering.
- Updated policy catalog and compiler goldens for the new footprint metadata, plus exact-shape tests through a shared footprint-stripping helper where the owned assertion is not the new metadata.
- Deviations from the draft: the live compiled-effect type is `EffectAST`; the live allocator integration point is `preview-budget-allocator.ts`; the generated fallout includes `Trace.schema.json`; the spec's one-line additive-score mention was stale and the ticket's multiplicative prior acceptance text was kept authoritative.
- Diagnostic FITL utility probe recorded: `decisions=2797`, `none=1731`, `constant=628`, `lowInformation=69`, `differentiating=369`; this is successor input for Phase C, not a Phase B terminal gate.
- Post-review correction: token movement, draw/create/remove-by-priority, and zone-marker effects now mark affected zones as touched for structural impact; `'unknown'` target sets no longer score against preview surfaces that read no entries for that surface. `compile-valid.golden.json` was refreshed for the resulting precise zone-touch footprint drift.
- Verification passed: `pnpm run check:ticket-deps`; `pnpm -F @ludoforge/engine build`; focused built Node lane for `preview-effect-footprint` and `preview-budget-allocator` (`15` tests, `2` suites after post-review correction); `pnpm turbo schema:artifacts`; `pnpm -F @ludoforge/engine test` (`64/64` default files after post-review correction); `pnpm turbo lint`; `pnpm turbo typecheck`; `pnpm turbo test`.
