# 166CANPARREF-004: Runtime resolver `onMissing` path, VM mirror, and `unknownCandidateParamRefs` trace

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/agents/policy-vm/vm.ts`, `packages/engine/src/cnl/policy-bytecode/feature-table.ts`
**Deps**: `archive/tickets/166CANPARREF-001.md`

## Problem

Spec 166 §4.4 / §4.5 / §6 extends the runtime resolver and bytecode VM to honor the new `onMissing: 'unavailable' | { kind: 'constant'; value }` field on compiled `candidateParam` refs, and adds a parallel trace surface `unknownCandidateParamRefs: Map<string, 'missing' | 'typeMismatch'>` to `EvaluationCandidate`. The interpreted dispatch at `policy-evaluation-core.ts:1231-1232` and the bytecode dispatch at `policy-vm/vm.ts:302-312` must mirror each other byte-for-byte (Foundation #8). The bytecode feature-table entry at `cnl/policy-bytecode/feature-table.ts:252-254` must emit the new `onMissing` field so the VM can read it.

This ticket can proceed in parallel with ticket 002 (parser) because the runtime dispatch consumes the discriminant shape established by ticket 001; tests use hand-constructed compiled refs and the synthetic two-action fixture.

## Assumption Reassessment (2026-05-11)

1. `resolveCandidateParam` lives at `packages/engine/src/agents/policy-runtime.ts:323-351`. Verified — current shape returns `undefined` when the param is missing or type-mismatched against `candidateParamDef.type`.
2. The suffix/indexed-binding fallback (`::paramId`, `::paramId[`) at `policy-runtime.ts:329-337` is preserved unchanged (Open Question §11.1).
3. `EvaluationCandidate` is at `packages/engine/src/agents/policy-evaluation-core.ts:99-100`; the `candidateParam` dispatch is at `:1231-1232`. Verified.
4. The VM dispatch is at `packages/engine/src/agents/policy-vm/vm.ts:302-312`. The WASM opcode slot is reserved at `policy-wasm-runtime.ts:50`. Verified.
5. The bytecode feature-table entry at `feature-table.ts:252-254` currently emits `id`; the new `onMissing` field augments without changing the existing slot encoding (Spec 166 §6).
6. `EvaluationCandidate` carries `unknownPreviewRefs` and `unknownLookupRefs` per existing convention; the new `unknownCandidateParamRefs` mirrors that shape and ordering.

## Architecture Check

1. **Two-runtime parity (Foundation #8 / Foundation #16).** Every change to the interpreted dispatch is mirrored byte-identically in the VM dispatch; an architectural-invariant test asserts both paths produce identical contributions and identical trace maps for a fixed compiled ref set. No drift between the two runtimes.
2. **No preview drive (Foundation #20).** The resolver never invokes preview, never reads `DriveResult.state`, never populates `unknownPreviewRefs[]`. A dedicated architectural-invariant test (`candidate-params-preview-isolation.test.ts`) verifies `previewDriveInvocationCount === 0` for policies that read only `candidate.params.*`.
3. **Determinism by construction (Foundation #8).** Map insertion order for `unknownCandidateParamRefs` and provenance ordering for ready resolutions is established by the deterministic candidate iteration order; replaying the same move produces byte-identical trace structure.
4. **Provenance integrity (Foundation #9).** Ready resolutions appear in the existing `considerations[].refs[]` channel with `provenance: 'publishedCandidate'`; no parallel "ready ref" bucket is created. Unavailable resolutions go into the dedicated `unknownCandidateParamRefs` map, keyed by ref id with the reason discriminant (`'missing' | 'typeMismatch'`).

## What to Change

### 1. Extend `resolveCandidateParam` with `onMissing` constant path

In `packages/engine/src/agents/policy-runtime.ts:323-351`, extend the resolver signature to take the compiled ref's `onMissing` policy (or thread the full `CompiledAgentPolicyRef.candidateParam` shape rather than just `paramId`, whichever causes less churn at the caller). Implementation flow per Spec 166 §4.4:

1. Look up `candidate.move.params[paramId]`.
2. If undefined, run the existing suffix/indexed-binding fallback unchanged (preserve the for-loop walking `::paramId` / `::paramId[`).
3. If still undefined:
   - `onMissing.kind === 'constant'` (i.e., `onMissing` is the object form): return `{ status: 'missing', resolvedValue: onMissing.value }`. Trace records `status: 'missing'` with `resolvedValue: <constant>`. The constant DOES NOT populate `unknownCandidateParamRefs` — the constant fallback obviates the "unknown" channel.
   - Else (`onMissing === 'unavailable'`): return `undefined`. Caller (the dispatch site) records the ref id in the per-candidate `unknownCandidateParamRefs` map with reason `'missing'`.
4. If present, type-coerce against `candidateParamDef.type`:
   - Type match: return the value.
   - Type mismatch: return `undefined` AND signal `'typeMismatch'`. The simplest approach is a small result tuple — e.g., return `{ kind: 'ready', value } | { kind: 'unavailable', reason: 'missing' | 'typeMismatch' } | { kind: 'constant', value }`.

The exact internal return shape is implementation-defined; what matters is that the dispatch site at `policy-evaluation-core.ts:1231-1232` can distinguish the three outcomes deterministically and populate `unknownCandidateParamRefs` with the correct reason. The existing return-`undefined`-only contract may stay if the dispatch site reads `onMissing` directly to choose the reason — either is acceptable; pick the lower-churn path during implementation.

### 2. Extend `EvaluationCandidate`

In `packages/engine/src/agents/policy-evaluation-core.ts:99-100`, add:

```
readonly unknownCandidateParamRefs: Map<string, CandidateParamUnavailabilityReason>;
```

where `CandidateParamUnavailabilityReason = 'missing' | 'typeMismatch'`. Export the type alongside the existing `PreviewUnavailabilityReason` / `LookupUnavailabilityReason` (or analogous) types. Initialize the map empty for every candidate at the start of evaluation; mutate during dispatch.

### 3. Update interpreted dispatch

In `policy-evaluation-core.ts:1231-1232`'s `case 'candidateParam'`:

- Call the extended resolver per §1.
- On `ready`: emit a ready ref into `considerations[].refs[]` with `value`, `status: 'ready'`, `provenance: 'publishedCandidate'`.
- On `constant`: emit a ref with `status: 'missing'`, `resolvedValue: <constant>`, `provenance: 'publishedCandidate'`. Do not touch `unknownCandidateParamRefs`.
- On `unavailable`: insert the ref id into `unknownCandidateParamRefs` with the correct reason discriminant. The downstream contribution computation continues per the existing unavailable-ref handling (zero contribution unless a consideration-level fallback fires, owned by ticket 005).

### 4. Update VM dispatch

In `packages/engine/src/agents/policy-vm/vm.ts:302-312`'s `case 'candidateParam'`: mirror §3 semantics exactly. Read `onMissing` from the bytecode slot emitted by §5 below.

### 5. Update bytecode feature-table

In `packages/engine/src/cnl/policy-bytecode/feature-table.ts:252-254`, extend the `candidateParam` entry's emitted slots to carry `onMissing`. Encoding suggestion:

- One byte (or one constant pool index) for the `onMissing` discriminant tag: `0` = unavailable, `1` = constant-number, `2` = constant-string, `3` = constant-boolean.
- For non-unavailable tags, the next slot carries the constant value (or constant-pool index). Reuse the existing constant-pool plumbing if present; otherwise inline-encode in the bytecode stream as the existing entry's `id` field is encoded.

Document the encoding in a comment co-located with the entry. The WASM opcode slot at `policy-wasm-runtime.ts:50` is reserved (`candidateParam: 9`); WASM-side onMissing decoding is a future-spec concern (WASM is currently a stub per the existing comment at `:50`). Leave the WASM stub unchanged; the encoding is forward-compatible.

### 6. Microturn-option-eval uniform tuple (minimal stub)

In `packages/engine/src/agents/microturn-option-eval.ts:28-29`, add `unknownCandidateParamRefs: new Map()` to the per-option result tuple as an empty default. This keeps the tuple shape uniform across the aggregation pipeline. Full propagation through `microturn-option-evaluator.ts` and `policy-agent.ts` is owned by ticket 005; this ticket only ensures the shape compiles and existing aggregation tests do not regress.

### 7. Architectural-invariant + golden-trace tests

Add under `packages/engine/test/architecture/candidate-param-refs/`:

- `candidate-params-preview-isolation.test.ts` (Spec 166 §8.1 #8) — assert `previewDriveInvocationCount === 0`, `unknownPreviewRefs.size === 0`, no `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory emitted when the policy reads only `candidate.params.*`.
- `candidate-params-determinism.test.ts` (§8.1 #9) — replay a move twice; assert byte-identical `unknownCandidateParamRefs` map (key order + values) and byte-identical resolved contribution values. Header: `// @test-class: architectural-invariant`.
- `candidate-params-collection-coverage.test.ts` (§8.1 #10) — each scalar type (`number`, `boolean`, `id`, enum-string `id`) exercised with both `ready` and `missing` outcomes against the synthetic fixture.
- `candidate-params-conformance-corpus.test.ts` (§8.1 #11) — tiny action-param examples for perfect-info, hidden-info, stochastic, asymmetric/phase-heavy game families per Foundation #16.

Add under `packages/engine/test/golden-traces/candidate-param-refs/` (or analogous):

- `candidate-params-toy-same-action-tracing.test.ts` (§8.1 #12) — golden-trace: two legal candidates differ by `params.mode ∈ {A, B}`; consideration penalizes `mode=B`; trace shows one ready ref with `value: A, contribution: 0` and one with `value: B, contribution: -<weight>`; both candidates' `unknownCandidateParamRefs` are empty. Header: `// @test-class: golden-trace`.

VM/interpreter parity sub-case is integrated into `candidate-params-determinism.test.ts` (same compiled ref, run via both interpreted dispatch and bytecode VM, assert byte-identical contributions and trace maps). This satisfies the two-runtime parity invariant from §1 above.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-vm/vm.ts` (modify)
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify)
- `packages/engine/src/agents/microturn-option-eval.ts` (modify — empty stub addition only)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-preview-isolation.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-determinism.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-collection-coverage.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-conformance-corpus.test.ts` (new)
- `packages/engine/test/golden-traces/candidate-param-refs/candidate-params-toy-same-action-tracing.test.ts` (new — exact directory path may differ; place under the existing golden-traces root)

## Out of Scope

- Trace propagation through `microturn-option-evaluator.ts` aggregation and `policy-agent.ts` per-candidate channel — owned by ticket 005. This ticket adds the empty-tuple stub but does not aggregate.
- `candidateParamFallbackFired` counter — owned by ticket 005.
- FITL `event` action declaration and FITL-specific golden traces — owned by ticket 006.
- WASM-side `onMissing` decoding — not implemented (stub slot at `policy-wasm-runtime.ts:50` is reserved for forward compatibility).

## Acceptance Criteria

### Tests That Must Pass

1. `candidate-params-preview-isolation.test.ts` — preview drive count strictly zero for candidate-param-only policies.
2. `candidate-params-determinism.test.ts` — replay byte-identity (also exercises VM/interpreter parity).
3. `candidate-params-collection-coverage.test.ts` — every scalar type × {ready, missing}.
4. `candidate-params-conformance-corpus.test.ts` — all four game families have a passing sub-case.
5. `candidate-params-toy-same-action-tracing.test.ts` — pinned golden trace produces expected contributions and ready-ref provenance.
6. Existing suite: `pnpm turbo test` — full pass; no regression in preview/lookup runtime paths.

### Invariants

1. Foundation #20 — `unknownPreviewRefs.size === 0` for any frontier whose only unavailable refs are `candidate.params.*`. No silent coercion of candidate-param unavailability into a preview contribution.
2. Foundation #8 — replay a move N times; `unknownCandidateParamRefs` map key order, values, and overall trace structure are byte-identical across runs.
3. Foundation #16 / two-runtime parity — interpreted dispatch and bytecode VM dispatch produce byte-identical resolved values and trace maps for the same compiled ref set.

## Test Plan

### New/Modified Tests

1. Four architectural-invariant tests under `candidate-param-refs/` per §7 above.
2. One golden-trace test under `golden-traces/candidate-param-refs/`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern=candidate-params`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`

## Outcome

Completion date: 2026-05-12

What landed:

- `resolveCandidateParam` now returns explicit ready, missing-constant, and unavailable results. It preserves the existing `::paramId` / `::paramId[` suffix fallback before applying `onMissing`.
- Interpreted candidate-param dispatch now records `unknownCandidateParamRefs` with public ref ids like `candidate.params.mode` and reasons `missing` or `typeMismatch`.
- `onMissing: { kind: 'constant', value }` returns the constant without populating `unknownCandidateParamRefs`.
- The bytecode feature table now emits `onMissing` aux slots, and the TypeScript VM mirrors interpreter behavior for missing constants, suffix/indexed fallback, and candidate-param type checks using `candidateParamDefs`.
- `unknownCandidateParamRefs` is now a required policy trace/metadata channel with empty defaults in non-candidate-param paths. This required `Trace.schema.json` regeneration and test fixture updates.
- `microturn-option-eval.ts` carries the empty `unknownCandidateParamRefs` tuple field for the uniform shape promised by this ticket. Population/aggregation through `microturn-option-evaluator.ts` and fallback-fired counters remain deferred to ticket 005.

Touched-file scope corrections:

- Added owned fallout: `packages/engine/src/agents/policy-eval.ts`, `packages/engine/src/agents/policy-agent.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, `packages/engine/schemas/Trace.schema.json`, and trace/schema/bytecode fixture tests. These are required by the new required metadata/schema channel and VM parity proof.
- Deferred to `tickets/166CANPARREF-005.md`: runtime application/aggregation of `candidateParamFallbackFired`, microturn-option aggregation in `microturn-option-evaluator.ts`, and populated policy-agent per-candidate aggregation beyond empty/default channel threading.

Generated schema/artifact fallout:

- `pnpm -F @ludoforge/engine run schema:artifacts` regenerated schema artifacts.
- Persisted diff: `packages/engine/schemas/Trace.schema.json`.
- `GameDef.schema.json` and `EvalReport.schema.json` were rewritten by the generator but remained byte-identical.

Verification command substitutions:

- The drafted focused command `pnpm -F @ludoforge/engine test --test-name-pattern=candidate-params` is Jest-style and not the repo-valid engine focused lane. The repo-valid focused lane is `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/candidate-param-refs/*.js` after `pnpm -F @ludoforge/engine build`.

Source-size ledger:

- `packages/engine/src/agents/policy-evaluation-core.ts | 1828 before | 1849 after | crossed cap? no, preexisting oversize | active growth: candidate-param dispatch and trace-map write | extraction/defer rationale: canonical evaluator hub; extraction would obscure the dispatch seam | successor: none`
- `packages/engine/src/agents/policy-eval.ts | 1461 before | 1473 after | crossed cap? no, preexisting oversize | active growth: metadata defaults and serialization | extraction/defer rationale: canonical policy metadata hub; no separable helper justified | successor: none`
- `packages/engine/src/agents/policy-agent.ts | 812 before | 825 after | crossed cap? no, preexisting oversize | active growth: empty/default channel threading for required metadata shape | extraction/defer rationale: type/trace fallout only; 005 owns populated aggregation | successor: tickets/166CANPARREF-005.md for real aggregation`
- `packages/engine/src/kernel/types-core.ts | 2193 before | 2201 after | crossed cap? no, preexisting oversize | active growth: trace type mirror | extraction/defer rationale: canonical schema/type hub | successor: none`
- `packages/engine/src/kernel/schemas-core.ts | 2615 before | 2623 after | crossed cap? no, preexisting oversize | active growth: trace zod schema mirror | extraction/defer rationale: canonical schema hub | successor: none`

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/candidate-param-refs/*.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js dist/test/integration/policy-bytecode-equivalence.test.js` — passed after the bytecode fixture was updated to include the candidate-param def in the VM context.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-diagnostics.test.js dist/test/unit/agents/policy-diagnostics-preview.test.js dist/test/unit/trace/policy-trace-shape.test.js dist/test/unit/json-schema.test.js` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `pnpm -F @ludoforge/engine test` — passed; default lane summary `65/65 files passed`.
- `pnpm turbo test` — passed; 5/5 tasks successful.
- `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/candidate-param-refs/*.js` — passed after the Turbo rebuild; 18 tests, 8 suites.
- `pnpm turbo lint` — passed; 2/2 tasks successful.

Late ticket-only status/proof transcription did not invalidate runtime, schema, or generated-artifact proof.
