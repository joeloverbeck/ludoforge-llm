# Spec 206 — WASM Candidate-Feature Coverage Parity and Drift Guard

**Status**: PROPOSED
**Priority**: Medium — Correctness is not at risk (the TS oracle path is exact), but production FITL baselines silently lost WASM acceleration for an entire class of candidate features when Spec 201 landed, and nothing surfaced it until an unrelated architectural-invariant test (`arvn-tournament-wasm-equivalence`) tripped during PR #291 CI recovery. The gap is *visibility and forcing function*, not a live bug.
**Complexity**: M — A standing coverage assertion (guard) is small; extending the WASM bytecode emitter / preview-row materialization to cover the tractable ref shapes is moderate; full `preview.relationship.*` materialization is large and explicitly out of scope here.
**Date**: 2026-05-28
**Dependencies**:
- `archive/specs/201-fitl-shared-doctrine-and-lifecycle.md` (COMPLETED) — introduced the `preview.relationship.<role>.*` ref family and the `projectedLeaderMarginDelta` / `projectedAllyMarginDelta` candidate features that exposed the gap.
- `archive/specs/154-policy-bytecode-emitter-evaluator-dispatch-completeness.md` (reference shape) — the paired-contract / coverage-completeness pattern this spec generalizes from the score-row dispatch to candidate-feature-row materialization.

**Trigger**: PR #291 CI recovery (commit `972f3c398`). The WASM score-row route was being silently disabled for the production ARVN baseline because a Spec-201 candidate feature (`projectedLeaderMarginDelta`) was not WASM-row-evaluable; the route returned `false` and fell entirely to TS. The hot-fix made the route degrade per-row to the TS oracle (`pushTsOracleCandidateFeatureRow` in `packages/engine/src/agents/policy-wasm-score-routing.ts`). This spec closes the underlying design gap that fix papered over.

**Ticket namespace**: `206WASMCANDCOV`

---

## 1. Goal

Make WASM-vs-TS candidate-feature coverage an **explicit, monitored contract** instead of an implicit, silently-degrading one, and recover WASM acceleration for the candidate-feature shapes that are tractable to materialize.

Concretely:

1. **Coverage guard (forcing function).** Add a standing test that, for each production agent profile, classifies every preview-cost candidate feature as either *WASM-row-materializable* or *TS-oracle-only*, and asserts the classification against a checked-in manifest. When a new policy ref family or candidate-feature shape lands (as `preview.relationship.*` did in Spec 201), the manifest diff forces an explicit accept/extend decision in review rather than a silent acceleration loss that surfaces only via an unrelated invariant.

2. **Extend WASM materialization for the tractable shapes.** Make `evaluateDynamicCandidateFeatureRows` / the bytecode path cover the candidate-feature expression shapes Spec 201 introduced that do **not** require preview-state relationship evaluation:
   - role-selected `seatAgg` (`over: { role: currentLeader }` etc.) at a non-top-level position (e.g. inside `coalesce(sub(...))`);
   - non-preview `currentSurface` leaves nested inside such a `seatAgg` (e.g. `victory.currentMargin.$seat`), which are candidate-independent functions of the current state;
   - candidate-feature cross-refs (`feature.<otherCandidateFeature>`).
   These are deterministic functions of already-materialized rows + the current state and are within the slot/precompute model.

3. **Explicitly classify `preview.relationship.*` as TS-oracle-only (for now).** Document that `preview.relationship.<role>.{victoryMargin,gainValue,gainValueDelta}` requires full relationship evaluation in the *preview* state (dynamic role→seat resolution plus an arbitrary `gainValue` expression), which the fixed-slot WASM preview-row extraction model cannot express. Keep it on the TS oracle, recorded in the manifest, with a named follow-on for true materialization if profiling justifies it.

## 2. Non-Goals

- No change to scoring semantics or trajectories. The TS oracle is already byte-exact with TS scoring; WASM materialization, where added, must produce identical values (Foundation #8).
- No removal of the per-row TS-oracle degradation landed in PR #291 — it remains the correctness backstop for any uncovered shape.
- No attempt to fully materialize `preview.relationship.*` in WASM in this spec (see §10).
- No FITL-specific engine logic; all work is in the agnostic agent/bytecode layer (Foundation #1).

## 3. Context (verified against codebase, 2026-05-28)

- **Route entry / degradation**: `packages/engine/src/agents/policy-wasm-score-routing.ts` → `tryScoreMoveConsiderationsWithWasm`. For each preview-cost candidate feature it calls `materializePreviewDynamicRowsWithWasm(input, collectPreviewDynamicRefs(feature.expr))`, then `evaluateDynamicCandidateFeatureRows(...) ?? evaluateWasmCandidateFeatureRow(...)`. PR #291 changed the two "row could not be produced" branches (materialize `=== null`, and `rawValues === null`) to call the shared `pushTsOracleCandidateFeatureRow(id, costClass)` and `continue`, so the route stays exercised instead of returning `false`.
- **TS dynamic-row evaluator gap**: `packages/engine/src/agents/policy-wasm-dynamic-candidate-feature-rows.ts` → `evaluateDynamicCandidateFeatureRows` returns `null` unless the **top-level** expr is `seatAgg`. `evaluateDynamicCandidateFeatureExpr` already handles `op`/`seatAgg`/`ref` recursively (including `resolveSeatAggOver` with `{ role }`), so a `coalesce(sub(feature.X, seatAgg{role}), 0)` shape is evaluable in principle. The top-level guard is *one* blocker, but **not the only one** for the real `projectedLeaderMarginDelta` shape: its inner role-`seatAgg` leaf is `victory.currentMargin.$seat`, a **non-preview `currentSurface` ref**, and the `ref` case (`policy-wasm-dynamic-candidate-feature-rows.ts:80-85`) returns `undefined` for anything that is not `previewSurface` / `previewStateFeature`. That `undefined` then flows through `sub(…) → undefined` and is swallowed by the enclosing `coalesce(…, 0) → 0`, so merely lifting the guard would yield a silently-wrong `0` rather than an oracle fallback (the fix is in §4.2).
- **Ref collection gap**: `collectPreviewDynamicRefs` recognizes only `previewSurface` and `library/previewStateFeature` refs; `previewRelationship` is not collected (and `previewGlobalSlotsForRef` returns `undefined` for it).
- **Bytecode emitter**: `packages/engine/src/cnl/policy-bytecode/compile.ts` emits `RESOLVE_DYNAMIC(DYNAMIC_REASON_UNSUPPORTED_EXPR)` for unsupported operators (`clamp`, `if`, `in`, `scheduleLowerBound`); `scheduleLowerBound` (Spec 201) is precomputed in TS as a state feature, so it does not by itself disable the score-row route.
- **TS preview-relationship resolver**: `packages/engine/src/agents/policy-evaluation-core.ts` → `resolvePreviewRelationshipRef` resolves the role→seat inside `withEvaluationState(previewState, ...)` and reads `buildPolicyVictorySurface(def, previewState, runtime)` / the relationship `gainValue` expr — i.e. arbitrary evaluation against the preview state, not a fixed numeric slot.
- **Production features that exposed the gap** (`data/games/fire-in-the-lake/92-agents.md`): `projectedLeaderMarginDelta` (role-`seatAgg` + `feature.projectedCurrentLeaderMargin` cross-ref) and `projectedAllyMarginDelta` (`preview.relationship.nominalAlly.gainValueDelta`).
- **The only standing signal today**: `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` asserts `wasmRouteCount > 0` on a *planless control* corpus. It proves the route fires at all; it does **not** assert which production candidate features are WASM-covered, so a feature dropping to the TS oracle is invisible to it as long as one other feature keeps the route alive.

## 4. Architecture

### 4.1 Coverage manifest + guard test (P0)

Add a deterministic classifier and a checked-in manifest:

- A pure helper (agent layer) that, given a compiled profile + catalog, returns for each preview-cost candidate feature a verdict `{ id, coverage: 'wasm-row' | 'ts-oracle', reason }`, derived from the same predicates the route uses (`collectPreviewDynamicRefs`, the dynamic-row evaluability check, and a "contains unsupported op / uncollected ref" scan). The materializability predicate MUST treat non-preview `currentSurface` leaves as materializable (per §4.2); otherwise `projectedLeaderMarginDelta` is misclassified as `ts-oracle` even after P1 lands. No game execution required.
- A manifest fixture (e.g. `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json`) keyed by `{ gameDefHash, profileId }` listing the verdicts, with a check-mode (`UPDATE_*` env) re-bless like other golden fixtures.
- An architectural-invariant test that recomputes the verdicts for the production FITL profiles (and any other conformance-corpus game with agents) and asserts equality with the manifest. A diff means a feature changed WASM coverage — review must consciously accept it (extend WASM, or accept TS-oracle and re-bless the manifest).

This is the forcing function: it converts "silent acceleration loss" into "manifest diff in review."

### 4.2 Cover role-`seatAgg` and candidate-feature cross-refs (P1)

Lift the top-level-`seatAgg`-only restriction in `evaluateDynamicCandidateFeatureRows` so it evaluates any expression whose leaves are all materializable. The materializable-leaf set is: preview-dynamic refs, **non-preview `currentSurface` refs** (evaluated once against the current state — candidate-independent, e.g. via `buildPolicyVictorySurface(def, state, runtime)`), already-computed candidate-feature rows, literals/params, and `seatAgg`/`op` compositions thereof. `evaluateDynamicCandidateFeatureExpr` already recurses; the changes are (a) entering it for non-`seatAgg` top-level exprs, (b) evaluating `currentSurface` refs against current state instead of returning `undefined`, and (c) teaching it to read prior rows from the `candidateFeatureRows` accumulator (`policy-wasm-score-routing.ts:517`) for `feature.<id>` cross-refs — note that `projectedLeaderMarginDelta`'s cross-ref target `projectedCurrentLeaderMargin` is itself a *preview*-cost row, so the lookup must consult the unified accumulator, not only the non-preview `precomputedCandidateFeatures` slice (`:586`) handed to the bytecode VM.

The "any unmaterializable leaf ⇒ return `null` ⇒ TS oracle" guard cannot be layered onto the current `undefined` semantics, because `undefined` is overloaded: it means both "preview legitimately unavailable (must `coalesce` to its fallback)" **and** "structurally unmaterializable leaf (must abort the whole row to the oracle)". Introduce a distinct null-propagating sentinel for the structural case so an unmaterializable leaf aborts the row (returning `null` from `evaluateDynamicCandidateFeatureRows`) instead of being swallowed by an enclosing `coalesce` into a silently-wrong value (Foundation #8 / #20).

### 4.3 Classify `preview.relationship.*` as TS-oracle-only (P1)

Make `collectPreviewDynamicRefs` (or a sibling predicate) recognize `previewRelationship` refs explicitly and route their features to the TS oracle deterministically (today they slip through as "no refs" and only fail later at row evaluation). Record `coverage: 'ts-oracle', reason: 'preview-relationship requires preview-state role resolution'` in the manifest. This makes the deferral explicit and asserted, not incidental.

## 5. Edge cases

- A candidate feature mixing a materializable ref and `preview.relationship.*`: must classify as `ts-oracle` (whole-feature), never partially materialize.
- A profile with zero preview-cost candidate features: manifest entry is empty; the equivalence test must still hold (route may legitimately not materialize preview rows).
- Cross-ref ordering: `feature.X` cross-refs require X's row to be materialized earlier in the loop; the classifier and evaluator must respect `plan.candidateFeatures` order and fall to oracle if a dependency is itself oracle-only.
- WASM disabled (no runtime): the guard test is static (classification only) and must not require the WASM module.

## 6. Phases & acceptance criteria

- **P0 — Coverage guard**: classifier + manifest + architectural-invariant test land; running it on `main` is green; deleting/altering a production candidate feature's WASM coverage makes it fail with an actionable diff. *Acceptance*: a synthetic profile that adds a `preview.relationship.*` feature flips its manifest entry to `ts-oracle` and the test fails until re-blessed.
- **P1 — Extend materialization**: contingent on §4.2's `currentSurface`-leaf evaluation and null-propagating sentinel, `projectedLeaderMarginDelta` (role-`seatAgg` over a `currentSurface` leaf + `feature.<id>` cross-ref) classifies as `wasm-row` and its WASM-materialized values are byte-equal to the TS oracle on the production corpus; `arvn-tournament-wasm-equivalence` still passes and `wasmPreviewCandidateFeatureRowOracleFallbackCount` reflects only the genuinely oracle-only features. *Acceptance*: manifest shows `projectedLeaderMarginDelta: wasm-row`, `projectedAllyMarginDelta: ts-oracle`, plus an explicit per-candidate byte-equivalence assertion (WASM row vs. TS oracle) for `projectedLeaderMarginDelta`.

## 7. Test plan

- **Unit**: classifier verdicts for hand-built profiles covering each shape (previewSurface ref, previewStateFeature ref, role-`seatAgg`, cross-ref, `preview.relationship.*`, mixed, unsupported op).
- **Architectural-invariant**: manifest-equality test over the production FITL profiles + at least one other conformance-corpus game with agents (Foundation #16 game-agnosticism).
- **Equivalence (existing)**: `arvn-tournament-wasm-equivalence` and `policy-bytecode-equivalence` must remain green; after P1 the WASM-row count for the ARVN corpus strictly increases (one fewer oracle fallback) with identical decision streams.
- **Determinism**: no trajectory change anywhere; replay-identity and Zobrist parity lanes unaffected.

## 8. Foundation alignment

- **#8 Determinism Is Sacred** — every materialized value must equal the TS oracle exactly; the guard enforces equivalence by construction.
- **#15 Architectural Completeness** — a ref family added to the TS evaluator without a paired WASM decision is the exact gap this closes; the manifest makes the paired contract explicit (cf. Spec 154's dispatch-completeness pattern).
- **#16 Testing as Proof** — WASM coverage becomes proven by a standing test, not assumed.
- **#10 Bounded Computation** — classification is static and bounded; no new unbounded work on the hot path.

## 9. Reassessment of the PR #291 hot-fix

The per-row TS-oracle degradation (`pushTsOracleCandidateFeatureRow`) is correct and should stay as the backstop. It is *not* sufficient on its own because it is silent: it neither records which features dropped to the oracle in a reviewable artifact nor forces a decision when a new shape lands. P0 here supplies that missing visibility; P1 reclaims the acceleration the hot-fix conceded for the tractable shapes.

## 10. Out of scope (named follow-on)

- **Full `preview.relationship.*` WASM materialization** — would require resolving the relationship role→seat and evaluating the `gainValue` expression *inside* the WASM-driven preview state, beyond the fixed-slot extraction model. Defer to a dedicated spec, justified only if profiling shows the ARVN ally-doctrine features are a measurable scoring-time cost.
- **Agnostic coverage corpus with real preview-cost features** — exercising the classifier against a *second* preview-enabled game (beyond FITL) to prove agnostic coverage classification on non-empty non-FITL manifests. Deferred until such a game exists in the conformance corpus (see §11.3).
- Extending the bytecode VM to support `scheduleLowerBound`/`clamp`/`if`/`in` operators (independent deferral noted in `compile.ts`).

## 11. Resolved decisions

1. **Manifest granularity** — key the manifest per-`(profileId, featureExprFingerprint)`, not per-`(gameDefHash, profileId)`. Coverage is a deterministic function of the compiled feature expr plus the route's materializability predicates, *not* of the rest of the GameDef, so fingerprinting the feature expr re-blesses exactly when coverage can change and avoids churn on every unrelated FITL `gameDefHash` shift. `profileId` disambiguates same-named features across profiles.
2. **Lane** — the guard lives in the `default` lane. Classification is static and MUST NOT require the WASM module (§5 edge case), so it belongs with the fast static checks rather than the determinism/policy-quality lanes.
3. **Conformance-corpus breadth** — no non-FITL game has preview-cost candidate features today (`generic-control` and `texas-holdem` both declare `preview: mode: disabled`). P0 therefore ships real per-feature coverage classification **FITL-only**; the non-FITL conformance games with agents exercise the *agnostic classifier path* against empty manifests (proving the classifier runs game-agnostically and emits zero entries on zero-preview profiles, per §5). A corpus with a second preview-enabled game is a named follow-on (§10).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-28:

- [`tickets/206WASMCANDCOV-001.md`](../tickets/206WASMCANDCOV-001.md) — Coverage classifier helper + unit tests (covers §4.1 classifier)
- [`tickets/206WASMCANDCOV-002.md`](../tickets/206WASMCANDCOV-002.md) — Coverage manifest fixture + architectural-invariant guard test (covers §4.1 manifest + §6 P0)
- [`tickets/206WASMCANDCOV-003.md`](../tickets/206WASMCANDCOV-003.md) — Extend dynamic candidate-feature row materialization: currentSurface leaves, cross-refs, null sentinel (covers §4.2 + §6 P1)
- [`tickets/206WASMCANDCOV-004.md`](../tickets/206WASMCANDCOV-004.md) — Explicit `previewRelationship` deferral in the score-row route (covers §4.3)
