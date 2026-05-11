# 166CANPARREF-003: Required-fallback collector and `candidateParamFallback` lowering

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/cnl/compile-agents.ts`
**Deps**: `tickets/166CANPARREF-002.md`

## Problem

Spec 166 §4.3 and §5.6/§5.8 add a third state-source-keyed fallback bucket alongside the existing `previewFallback` (preview refs) and `lookupFallback` (lookup-surface refs):

| Ref family | Required consideration-level fallback |
|---|---|
| `previewOptionRef` | `previewFallback.onUnavailable` |
| `lookup.surface: policyState` | `lookupFallback.onUnavailable` |
| `lookup.surface: previewOptionState` | `previewFallback.onUnavailable` |
| **`candidateParam`** (this ticket) | **`candidateParamFallback.onUnavailable`** |

A consideration whose `value` reads any `candidate.params.<name>` ref with `onMissing: 'unavailable'` (default) MUST declare `candidateParamFallback.onUnavailable`. The existing fallback enforcement block at `compile-agents.ts:2086-2131` and the helper `lowerLookupFallback` at `:3496` plus `collectLookupRefIds` at `:3609` provide the canonical mirror. This ticket adds the parallel collector and lowering helper and wires the required-fallback diagnostic.

## Assumption Reassessment (2026-05-11)

1. `collectLookupRefIds` is at `compile-agents.ts:3609`. Verified.
2. `lowerLookupFallback` is at `compile-agents.ts:3496`. Verified.
3. The required-fallback diagnostic enforcement block is at `compile-agents.ts:2086-2131` and currently emits `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` (registry line `:269`).
4. Compiled consideration shape carries `previewFallback?` / `lookupFallback?` fields; the new `candidateParamFallback?` is added alongside without breaking existing serialization paths.
5. Ticket 002 (dep) makes `candidate.params.*` refs lowerable — the collector here walks the lowered value expression and matches on `kind: 'candidateParam'`.
6. The new diagnostic code `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK` is registered by ticket 001.

## Architecture Check

1. **State-source-keyed partitioning preserved.** Each ref family has its own fallback channel, keeping provenance honest in trace output. This mirrors Spec 165 §4.6 and Spec 163's partitioning; no channel collapse / no single "fallback" bucket.
2. **`onMissing`-aware collection.** The collector returns only refs whose `onMissing === 'unavailable'` (i.e., those that can resolve to unavailability at runtime). Refs with `onMissing: { kind: 'constant' }` never produce an unavailable contribution and therefore DO NOT require `candidateParamFallback`. The compiler is precise about which authoring patterns need which fallback.
3. **Mixed-surface rule (Foundation #15).** A consideration whose `value` mixes candidate-param refs with preview-derived or lookup refs MUST declare every relevant fallback. This is the existing mixed-surface rule applied uniformly; no per-family carve-out.
4. **No alias / shim (Foundation #14).** The `candidateParamFallback` field is a new compiled-consideration field; the existing `previewFallback` / `lookupFallback` fields are not aliased or merged. A consideration carrying all three field types is a well-formed shape.

## What to Change

### 1. Add `collectCandidateParamRefIds`

Beneath `collectLookupRefIds` at `compile-agents.ts:3609`, add:

```
function collectCandidateParamRefIds(
  expr: CompiledAgentPolicyExpr,
  onMissingPolicyFilter?: 'unavailable' | 'all'
): ReadonlyArray<string>
```

Walks the expression tree (reusing the same walker structure as `collectLookupRefIds`), collects every `kind: 'candidateParam'` ref, and returns the set of distinct ref ids whose `onMissing === 'unavailable'` (when `onMissingPolicyFilter` is `'unavailable'` or unspecified) or all candidateParam refs (when `'all'`). Default filter is `'unavailable'` so callers get only the refs that can produce unavailability and therefore require fallback.

### 2. Add `lowerCandidateParamFallback`

Beneath `lowerLookupFallback` at `compile-agents.ts:3496`, add the parallel:

```
function lowerCandidateParamFallback(
  considerationId: string,
  path: AuthoringPath,
  def: unknown,
  diagnostics: CompilerDiagnostics
): ConsiderationParamFallback | null
```

Accepted YAML shape mirrors Spec 165's lookup fallback:

```yaml
candidateParamFallback:
  onUnavailable: noContribution         # zero-contribution path
# or
candidateParamFallback:
  onUnavailable: { constant: 0 }        # explicit numeric coercion
```

Returns the lowered `{ onUnavailable: 'noContribution' } | { onUnavailable: { kind: 'constant'; value: number } }` shape. Reuse the same `ConsiderationParamFallback` type structure as `previewFallback` / `lookupFallback`; if a shared union type already exists for those, extend or alias accordingly without introducing a new top-level type. The constant value is typed `number` (consistent with the existing fallback channels — fallback contributions are numeric scalars regardless of which scalar type the ref family produces, because the consideration's overall arithmetic eventually resolves to a numeric contribution).

### 3. Wire the required-fallback diagnostic at `:2086-2131`

In the existing fallback-enforcement block, alongside the lookup checks:

- Compute `const candidateParamRefIds = collectCandidateParamRefIds(value.expr);` (default filter — only `onMissing: 'unavailable'` refs).
- Compute `const candidateParamFallback = lowerCandidateParamFallback(considerationId, '${path}.candidateParamFallback', def.candidateParamFallback, this.diagnostics);`.
- If `candidateParamRefIds.length > 0` AND `candidateParamFallback === undefined`, emit:
  ```
  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK,
  path: <consideration path>,
  severity: 'error',
  message: `Consideration "${considerationId}" reads candidate.params.* ref(s) [${ids.join(', ')}] without declaring candidateParamFallback.onUnavailable. Add candidateParamFallback: { onUnavailable: noContribution } or { onUnavailable: { constant: <number> } }.`,
  suggestion: 'Required for refs whose onMissing is "unavailable" (default). Refs with onMissing: { kind: constant } do not require this fallback.'
  ```
- Attach `candidateParamFallback` to the compiled consideration alongside `previewFallback` / `lookupFallback`.

### 4. Architectural-invariant test for required fallback

`packages/engine/test/architecture/candidate-param-refs/candidate-params-fallback-required.test.ts` (Spec 166 §8.1 #6) — three sub-cases:

1. `candidate.params.side` with `onMissing: 'unavailable'` (default) and no `candidateParamFallback` → fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK`.
2. Same ref with `candidateParamFallback: { onUnavailable: noContribution }` → compiles.
3. Ref with `onMissing: { kind: constant, value: __absent__ }` (where `__absent__` is a string sentinel matching the param's `id` type) and no `candidateParamFallback` → compiles (constant fallback obviates the consideration-level requirement).

Plus one mixed-surface sub-case: a consideration combining `candidate.params.X` and `lookup.surface: policyState` refs requires BOTH `candidateParamFallback` and `lookupFallback`; omitting either fails with the family-specific code.

The test reuses the synthetic fixture from `candidate-params-fixture.ts` introduced by ticket 002. Header: `// @test-class: architectural-invariant`.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-fallback-required.test.ts` (new)

## Out of Scope

- Trace recording of `candidateParamFallbackFired` (the runtime-side map) — owned by ticket 005.
- Runtime application of `candidateParamFallback` when the resolver returns unavailable — owned by ticket 004 (resolver) and ticket 005 (aggregation).
- Renaming or unifying the three fallback channels into one — explicitly out of scope per spec §3 and §4.3 (channel partitioning is the whole point).
- Adding `aggregate count`/`min`/`max` operators over `idList`-typed candidate params — deferred per Spec 166 §11.2.

## Acceptance Criteria

### Tests That Must Pass

1. The four sub-cases of `candidate-params-fallback-required.test.ts` pass exactly as specified.
2. Existing fallback-required tests for `previewFallback` and `lookupFallback` continue to pass (no regression in the sibling collectors).
3. Existing suite: `pnpm turbo test` — full pass.

### Invariants

1. A consideration whose `value` reads any `candidate.params.<name>` with `onMissing: 'unavailable'` AND omits `candidateParamFallback` MUST NOT compile.
2. A consideration whose every `candidate.params.<name>` ref has `onMissing: { kind: 'constant' }` MUST NOT require `candidateParamFallback` (constant fallback obviates consideration-level fallback).
3. The compiled consideration's `candidateParamFallback?` field is set if and only if the YAML declared it; absence is preserved as `undefined`, never coerced to a default (Foundation #20 — no silent coercion).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/candidate-param-refs/candidate-params-fallback-required.test.ts` — required-fallback enforcement + mixed-surface sub-case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern=candidate-params-fallback`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`
