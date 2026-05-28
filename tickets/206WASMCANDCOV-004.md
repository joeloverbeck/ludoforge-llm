# 206WASMCANDCOV-004: Explicit previewRelationship deferral in the score-row route

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-score-routing.ts` (ref recognition); manifest reason re-bless
**Deps**: `archive/tickets/206WASMCANDCOV-001.md`, `archive/tickets/206WASMCANDCOV-002.md`

## Problem

`preview.relationship.<role>.{victoryMargin,gainValue,gainValueDelta}` refs require resolving the relationship role→seat and evaluating an arbitrary `gainValue` expression *inside* the preview state (`packages/engine/src/agents/policy-evaluation-core.ts:2330` `resolvePreviewRelationshipRef`, via `withEvaluationState(previewState, …)` + `buildPolicyVictorySurface`). The fixed-slot WASM preview-row extraction model cannot express this, so these features must stay on the TS oracle.

Today the deferral is **incidental**: `collectPreviewDynamicRefs` (`policy-wasm-score-routing.ts:101-149`) does not recognize `previewRelationship`, and `previewGlobalSlotsForRef` returns `undefined` for it (`:175-176`), so a `preview.relationship.*` feature slips through as "no refs", attempts materialization, and only fails later at row evaluation (`rawValues === null` → per-row oracle fallback at `:598-606`). This ticket makes the deferral **explicit and deterministic** (§4.3): recognize `previewRelationship` up-front, route the feature to the oracle immediately, and record the reason so the manifest deferral is asserted rather than emergent.

## Assumption Reassessment (2026-05-28)

1. `collectPreviewDynamicRefs` branches only on `previewSurface` and `library`/`previewStateFeature` (`:112-117`); `previewRelationship` is uncollected — confirmed. `previewGlobalSlotsForRef` returns `undefined` for it (`:175-176`) — confirmed.
2. `resolvePreviewRelationshipRef` does arbitrary preview-state expression evaluation, not a fixed-slot read — confirmed (`policy-evaluation-core.ts:2330`); the TS-oracle-only deferral is correct and unchanged.
3. The 001 classifier already classifies `previewRelationship` features as `ts-oracle` (uncollected ref → unmaterializable), and the 002 manifest records `projectedAllyMarginDelta: ts-oracle`. This ticket makes the *route* match that verdict deterministically up-front and aligns the manifest **reason** string.
4. The per-row oracle fallback (`pushTsOracleCandidateFeatureRow`, `:522-532`) landed in PR #291 and remains the correctness backstop; this ticket does not remove it — it short-circuits *before* an unnecessary materialization attempt for `previewRelationship` features.

## Architecture Check

1. Recognizing `previewRelationship` in the shared predicate and short-circuiting to the oracle up-front makes the route's behavior match the classifier verdict by construction, closing the "slips through then fails later" gap (Foundation #15). The per-row oracle backstop stays as defense-in-depth.
2. Engine-agnostic: `previewRelationship` is a generic `CompiledAgentPolicyRef` variant; the recognition is a generic ref-kind branch, no FITL logic (Foundation #1).
3. No behavior regression: features that already fell to the oracle still fall to the oracle with identical values — this only removes a wasted materialization attempt and makes the reason explicit (Foundation #8, no trajectory change).
4. No shim: the deferral is expressed directly in the predicate, not via a compatibility path (Foundation #14).

## What to Change

### 1. Recognize `previewRelationship` in the shared predicate

In `collectPreviewDynamicRefs` (or the sibling predicate lifted in `archive/tickets/206WASMCANDCOV-001.md`), detect a `previewRelationship` ref anywhere in the candidate-feature expr and signal "TS-oracle-only" so the route skips materialization and calls `pushTsOracleCandidateFeatureRow` directly for that feature.

### 2. Deterministic up-front deferral in the route

In the candidate-feature loop (`policy-wasm-score-routing.ts:533-622`), before attempting `materializePreviewDynamicRowsWithWasm`, short-circuit features flagged TS-oracle-only by the predicate (currently `previewRelationship`-bearing) straight to `pushTsOracleCandidateFeatureRow(id, feature.costClass); continue`.

### 3. Record the explicit reason

Ensure the 001 classifier emits `coverage: 'ts-oracle', reason: 'preview-relationship requires preview-state role resolution'` for these features and re-bless the 002 manifest reason for `projectedAllyMarginDelta` if its recorded reason string changes.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — predicate recognition + up-front deferral)
- `packages/engine/src/agents/policy-wasm-coverage-predicates.ts` (modify — only if the predicate was lifted to a sibling module in 001)
- `packages/engine/src/agents/policy-wasm-coverage-classifier.ts` (modify — explicit reason string, if not already final from 001)
- `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` (modify — re-bless `projectedAllyMarginDelta` reason if changed)

## Out of Scope

- Full `preview.relationship.*` WASM materialization (§10 follow-on) — these features stay TS-oracle-only.
- The §4.2 materialization extension (currentSurface/cross-refs/sentinel) — owned by `archive/tickets/206WASMCANDCOV-003.md`.
- Removing the per-row oracle backstop — it remains the correctness safety net.
- Any value/trajectory change — `projectedAllyMarginDelta` values are unchanged (Foundation #8).

## Acceptance Criteria

### Tests That Must Pass

1. A `preview.relationship.*` candidate feature routes to the oracle **without** a materialization attempt (deterministic up-front deferral), and its value is unchanged vs the prior incidental fallback.
2. The 002 guard passes with `projectedAllyMarginDelta: ts-oracle` and the explicit preview-relationship reason.
3. `arvn-tournament-wasm-equivalence` stays green with identical decision streams: `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js"`.

### Invariants

1. **Explicit deferral**: `previewRelationship`-bearing features are routed to the oracle by an up-front predicate decision, not by a late row-evaluation failure.
2. **No value change**: deferred features produce values byte-identical to the prior per-row oracle path (Foundation #8).
3. **Agnostic**: the recognition is a generic ref-kind branch; no game-specific identifiers (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-wasm-coverage-classifier.test.ts` (modify — assert the explicit `preview-relationship requires preview-state role resolution` reason for `previewRelationship` features).
2. `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` (modify — re-bless `projectedAllyMarginDelta` reason via `UPDATE_GOLDEN=1` if changed).
3. Reuse `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` for decision-stream identity (no new trajectory test needed — values unchanged).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js" "packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js"`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`
