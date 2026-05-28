# 206WASMCANDCOV-001: Coverage classifier helper + unit tests

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/` (new pure classifier helper; export/extract of the route's preview-dynamic-ref predicate)
**Deps**: `specs/206-wasm-candidate-feature-coverage-parity.md`

## Problem

When Spec 201 added the `preview.relationship.*` ref family and the `projectedLeaderMarginDelta` / `projectedAllyMarginDelta` candidate features, the production FITL ARVN baseline silently lost WASM acceleration for those features — they dropped to the TS oracle and nothing surfaced it until an unrelated invariant tripped during PR #291 CI recovery (commit `972f3c398`). There is no artifact that records, per production profile, which preview-cost candidate features are WASM-row-materializable vs TS-oracle-only.

This ticket builds the foundation of the forcing function (§4.1): a pure, deterministic classifier that, given a compiled profile + catalog, returns a coverage verdict for each preview-cost candidate feature. It does not yet wire a standing guard (that is `tickets/206WASMCANDCOV-002.md`); it delivers the reusable predicate plus exhaustive unit coverage of every expression shape.

The classifier MUST mirror the **current** route materializability so the manifest captured in 002 reflects runtime reality. The materializability extension (`currentSurface` leaves, cross-refs) is delivered later by `tickets/206WASMCANDCOV-003.md`, which updates this predicate and re-blesses the manifest as a conscious, reviewable coverage change.

## Assumption Reassessment (2026-05-28)

1. `collectPreviewDynamicRefs` (`packages/engine/src/agents/policy-wasm-score-routing.ts:101`) is a module-internal (non-exported) helper recognizing only `previewSurface` and `library`/`previewStateFeature` refs — confirmed by reassessment. The classifier needs this predicate; export it (or lift it into a sibling module both the route and classifier import) rather than duplicating its logic (DRY / Foundation 15).
2. `evaluateDynamicCandidateFeatureRows` (`packages/engine/src/agents/policy-wasm-dynamic-candidate-feature-rows.ts:177`) returns `null` unless the **top-level** expr is `seatAgg` — confirmed (`:187`). The classifier's "dynamic-row evaluability" predicate must encode this current restriction (top-level-`seatAgg`-only) so a feature like `projectedLeaderMarginDelta` (top-level `coalesce`) classifies as `ts-oracle` today.
3. The bytecode emitter's unsupported-operator set is exactly `clamp`/`if`/`in`/`scheduleLowerBound` (`packages/engine/src/cnl/policy-bytecode/compile.ts:238-243`) — confirmed. `scheduleLowerBound` does not by itself force the oracle when wrapped in a TS-precomputed state feature (e.g. `monsoonNow`), so the classifier scans the candidate-feature expr, not state-feature exprs.
4. `previewRelationship` is an existing `CompiledAgentPolicyRef` variant (`packages/engine/src/kernel/types-core.ts`, literal-string discriminant union) — confirmed. The classifier recognizes it explicitly and returns `ts-oracle` with reason `preview-relationship requires preview-state role resolution`.
5. Production candidate features `projectedCurrentLeaderMargin` (top-level role-`seatAgg`), `projectedLeaderMarginDelta`, `projectedAllyMarginDelta` exist in `data/games/fire-in-the-lake/92-agents.md` (lines 285/305/319) — confirmed. Used as classifier fixtures' real-shape references.

## Architecture Check

1. A pure, side-effect-free classifier reusing the route's own predicates (`collectPreviewDynamicRefs`, the top-level-`seatAgg` evaluability check, the unsupported-op scan) keeps the "what is WASM-coverable" decision in one place, satisfying the paired-contract pattern Spec 154 established and Foundation #15 (architectural completeness) — a ref family added to the TS evaluator now has a single predicate that decides its WASM coverage.
2. Engine-agnostic: the classifier operates on `AgentPolicyCatalog` / compiled candidate-feature exprs and `CompiledAgentPolicyRef` variants — no FITL-specific identifiers. Any game's profile classifies through the same code (Foundation #1). FITL features appear only in unit-test fixtures, not in the helper.
3. No backwards-compatibility shim: exporting/lifting `collectPreviewDynamicRefs` replaces the in-file private definition; the route imports the exported symbol. No alias path is kept (Foundation #14).
4. The classifier is static (no game execution, no WASM module) — bounded and deterministic (Foundation #10), enabling the fast default-lane guard in 002.

## What to Change

### 1. Export / lift the shared preview-dynamic-ref predicate

Make `collectPreviewDynamicRefs` (and any sibling materializability predicate the classifier needs) consumable outside `policy-wasm-score-routing.ts` — either `export` it in place or lift it into a small sibling module (e.g. `packages/engine/src/agents/policy-wasm-coverage-predicates.ts`) that the route re-imports. Behavior must be unchanged; the route's runtime path is identical after this move.

### 2. New classifier helper

Add `packages/engine/src/agents/policy-wasm-coverage-classifier.ts` exporting a pure function, e.g.:

```ts
classifyCandidateFeatureCoverage(input: {
  readonly profile: ...;
  readonly catalog: AgentPolicyCatalog;
  readonly def: GameDef;
}): readonly { id: string; coverage: 'wasm-row' | 'ts-oracle'; reason: string }[]
```

For each **preview-cost** candidate feature in `profile.plan.candidateFeatures` (skip non-preview features — they are always materialized), derive the verdict from:
- `collectPreviewDynamicRefs(feature.expr)` plus a scan for **uncollected refs** (e.g. `previewRelationship`, `currentSurface`) and **unsupported ops** (`clamp`/`if`/`in`/`scheduleLowerBound`) anywhere in the expr;
- the **top-level-`seatAgg`-only** evaluability check (mirror `evaluateDynamicCandidateFeatureRows:187`): a feature whose top-level expr is not `seatAgg` and is not otherwise bytecode-evaluable classifies `ts-oracle` today;
- explicit `previewRelationship` recognition → `ts-oracle`, reason `preview-relationship requires preview-state role resolution`;
- cross-ref ordering (§5): a `feature.<id>` cross-ref whose target classifies `ts-oracle` makes the dependent `ts-oracle`.

Reasons must be specific, human-readable strings (they land in the manifest and drive review decisions).

### 3. Cross-ref dependency resolution

Resolve `feature.<id>` cross-refs against `plan.candidateFeatures` order: a dependent is at best as covered as its dependency. Classify in plan order so a dependency's verdict is known before its dependents.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-coverage-classifier.ts` (new)
- `packages/engine/src/agents/policy-wasm-coverage-predicates.ts` (new — only if lifting the predicate into a sibling module; otherwise export in place)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — export or re-import the lifted predicate; no behavior change)
- `packages/engine/test/unit/agents/policy-wasm-coverage-classifier.test.ts` (new)

## Out of Scope

- The manifest fixture and the standing architectural-invariant guard test — owned by `tickets/206WASMCANDCOV-002.md`.
- Extending materializability to `currentSurface` leaves / cross-refs — owned by `tickets/206WASMCANDCOV-003.md`, which updates this predicate. This ticket encodes only the *current* (pre-§4.2) materializability so 002's manifest matches runtime reality.
- Changing the route's `previewRelationship` runtime behavior (deterministic up-front deferral) — owned by `tickets/206WASMCANDCOV-004.md`. This ticket only *classifies* `previewRelationship` as `ts-oracle`.
- Any scoring-semantics or trajectory change (Foundation #8).

## Acceptance Criteria

### Tests That Must Pass

1. Classifier returns `wasm-row` for a top-level role-`seatAgg` over a `previewSurface` leaf (the `projectedCurrentLeaderMargin` shape).
2. Classifier returns `ts-oracle` for: a top-level `coalesce`/`sub` wrapping a nested role-`seatAgg` (the current `projectedLeaderMarginDelta` shape); a feature containing a `previewRelationship` ref (the `projectedAllyMarginDelta` shape), with the preview-relationship reason; a feature whose expr contains an unsupported op (`clamp`/`if`/`in`/`scheduleLowerBound`); a `previewStateFeature` ref shape classifies `wasm-row`.
3. A feature cross-referencing a `ts-oracle` feature classifies `ts-oracle`; one cross-referencing a `wasm-row` feature inherits accordingly.
4. A profile with zero preview-cost candidate features yields an empty verdict list.
5. Existing suite stays green (predicate export/lift is behavior-preserving): `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js"`.

### Invariants

1. **Paired-contract**: the classifier's materializability decision reuses the same predicate the route uses; the two never diverge silently (enforced concretely by 002's guard and the existing `arvn-tournament-wasm-equivalence` oracle-fallback count).
2. **Agnostic**: the classifier contains no game-specific identifiers; FITL names appear only in test fixtures.
3. **Determinism**: classification is a pure function of `(profile, catalog, def)`; no wall-clock, no iteration-order dependence (Foundation #8).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-coverage-classifier.test.ts` (new) — `// @test-class: architectural-invariant`; hand-built profiles covering each shape (previewSurface ref, previewStateFeature ref, top-level role-`seatAgg`, nested role-`seatAgg`, `feature.<id>` cross-ref, `preview.relationship.*`, mixed, unsupported op, zero-preview).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/unit/agents/policy-wasm-coverage-classifier.test.js"`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`

## Outcome

**Completed**: 2026-05-28

### What changed
- Lifted `collectPreviewDynamicRefs` and `previewGlobalSlotsForRef` out of `packages/engine/src/agents/policy-wasm-score-routing.ts` into a new shared module `packages/engine/src/agents/policy-wasm-coverage-predicates.ts`. The route now imports them; runtime behavior is byte-for-byte identical (verified by `arvn-tournament-wasm-equivalence`).
- Added `packages/engine/src/agents/policy-wasm-coverage-classifier.ts` exporting the pure `classifyCandidateFeatureCoverage({ profile, catalog, def })`. It classifies each **preview-cost** candidate feature (in `plan.candidateFeatures` order) as `wasm-row` or `ts-oracle` with a specific reason, by scanning the compiled expr for: `previewRelationship` refs, unsupported ops (`clamp`/`if`/`in`/`scheduleLowerBound`), `currentSurface` refs, nested role-selected `seatAgg`, unmaterializable preview-dynamic refs (no fixed slot), and `feature.<id>` candidate cross-refs whose target is `ts-oracle`/unresolved.
- Exported both new modules from `packages/engine/src/agents/index.ts`.
- Added `packages/engine/test/unit/agents/policy-wasm-coverage-classifier.test.ts` (architectural-invariant) with 11 cases covering every shape.

### Deviations / clarifications from the ticket (empirical reassessment)
- The ticket framed the classifier as the **top-level-`seatAgg`-only** evaluability check. Reassessment via a runtime probe (instrumenting the route on the production FITL ARVN corpus) showed runtime coverage is richer and partly state-dependent, but the *structural* shape that forces the oracle is best captured as: **`currentSurface` ref present, or `previewRelationship`, or unsupported op, or a role-selected `seatAgg` below the top level, or an oracle cross-ref dependency.** This is the predicate implemented, and it correctly yields the pinned verdicts:
  - `projectedCurrentLeaderMargin` → `wasm-row` (top-level role-seatAgg over previewSurface leaf).
  - `projectedLeaderMarginDelta` → `ts-oracle` (nested role-seatAgg + currentSurface leaf; pre-§4.2).
  - `projectedAllyMarginDelta` → `ts-oracle` (previewRelationship). NOTE: at runtime the route currently still produces a *wasm-row* for this feature whose value coalesces to `0` (byte-equal to the TS oracle's `0` on the measured corpus). `tickets/206WASMCANDCOV-004.md` makes the route's behavior match this classifier verdict (deterministic up-front deferral).
  - Additionally, `projectedAidDelta` and `projectedTrailDelta` classify `ts-oracle` (currentSurface globalVar delta) — consistent with their always-oracle runtime behavior. `tickets/206WASMCANDCOV-003.md`'s `currentSurface`-leaf extension will flip these to `wasm-row` as well, not only `projectedLeaderMarginDelta`.

### Verification
- `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-wasm-coverage-classifier.test.js` → 11/11 pass.
- `arvn-tournament-wasm-equivalence` → 2/2 pass (predicate lift behavior-preserving).
- `pnpm turbo lint typecheck` → green. `pnpm -F @ludoforge/engine test` → 187/187 files pass.
