# 163GENLOOKUP-004: Consideration integration + trace surface for `lookup` ref family

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-evaluation-core.ts` (consideration-level fallback branch + `lookupFallbackFired` field); `kernel/types-core.ts` (trace export shape); `agents/policy-agent.ts` (frontier dispatch trace population)
**Deps**: `tickets/163GENLOOKUP-002.md`, `tickets/163GENLOOKUP-003.md`

## Problem

With lowering (ticket 002) and the runtime resolver (ticket 003) in place, `evaluateConsideration` must consume `lookupFallback` when a consideration's lookup-ref value resolves to `unavailable`. Per Foundation #20, unavailable lookups never silently coerce to numeric contributions — the consideration either omits its contribution (`onUnavailable: 'noContribution'`) or fires an explicit constant (`onUnavailable: { constant: N }`), and the chosen path is observable in the trace. This ticket lands the consideration-level branch and the `lookupFallbackFired` plumbing.

## Assumption Reassessment (2026-05-09)

1. `evaluateConsideration` consumes `previewFallback` at `policy-evaluation-core.ts:515-537` — a `consideration.hasPreviewRef === true` branch that:
   - throws if `previewFallback === undefined` (compiler should have rejected this; runtime check is defense-in-depth),
   - returns `0` and records `lookupFallbackFired: { kind: 'noContribution' }` when `onUnavailable === 'noContribution'`,
   - returns `fallback.value` and records `lookupFallbackFired: { kind: 'constant', value }` when `onUnavailable.kind === 'constant'`.
2. The `recordPreviewFallbackFired` helper at `:557-571` populates `candidate.previewFallbackFired` and propagates to `input.previewOption?.previewFallbackFired`. The new `recordLookupFallbackFired` mirrors this exactly.
3. The trace export shape declares `previewFallbackFired?: { termId; kind: 'noContribution' | 'constant'; value? }` at `kernel/types-core.ts:1782-1786`. Adding `lookupFallbackFired?` parallel slot.
4. `policy-agent.ts:74-91, 280-310` houses the frontier dispatch trace population for `unknownPreviewRefs` and `previewFallbackFired`. Ticket 003 wired `unknownLookupRefs`; this ticket wires `lookupFallbackFired`.
5. Ticket 002 set `hasLookupRef: lookupRefIds.length > 0` on the compiled consideration — this flag is what the new branch checks.

## Architecture Check

1. **Foundation #20 (Preview Signal Integrity)**: extending the integrity contract to the lookup family. The branch in `evaluateConsideration` ensures unavailable lookups never silently coerce to `0` — the consideration's contribution is explicitly omitted (and visible in trace as such) or explicitly fired (with constant value visible in trace).
2. **Foundation #9 (Replay, Telemetry, and Auditability)**: the `lookupFallbackFired` trace field gives the trace honest provenance for static-state evidence. A reader of the trace can distinguish:
   - "consideration didn't apply because the lookup was unavailable and the author chose to omit",
   - "consideration applied with the author-declared constant fallback",
   - "consideration applied with the resolved lookup value".
3. **Foundation #14 (No Backwards Compatibility)**: the legacy `unknownAs ?? 0` path remains the runtime fallback for **non-lookup, non-preview** unknown values. Lookup-ref considerations bypass it via `hasLookupRef === true` — there's no shim or alias path. The compiler enforces `lookupFallback` via `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` (ticket 002), so the runtime never sees a lookup-ref consideration without a declared fallback.
4. **Selection-reason variant naming (Spec 163 §4.2 note)**: the existing `tiebreakAfterPreviewNoSignal` reason is interpreted as "ref-no-signal" semantically once the lookup family fires. No new variant added (Foundation #14 — no churn for cosmetic naming).

## What to Change

### 1. `lookupFallbackFired` field on `PolicyEvaluationCandidate`

In `policy-evaluation-core.ts` adjacent to the existing `previewFallbackFired` field, add:

```ts
lookupFallbackFired?: PolicyLookupFallbackFired;
```

Where `PolicyLookupFallbackFired = { readonly termId: string; readonly kind: 'noContribution' | 'constant'; readonly value?: number }`.

### 2. `evaluateConsideration` branch

Extend the `weight`/`value` resolution failure path at `:514-542`. Before the legacy `unknownAs ?? 0` line, add a `consideration.hasLookupRef === true` branch that mirrors the `hasPreviewRef` branch:

```ts
if (consideration.hasLookupRef === true) {
  const fallback = consideration.lookupFallback?.onUnavailable;
  if (fallback === undefined) {
    throw this.runtimeError(
      'RUNTIME_EVALUATION_ERROR',
      `Lookup consideration "${considerationId}" did not declare lookupFallback.onUnavailable.`,
      { considerationId },
    );
  }
  if (fallback === 'noContribution') {
    this.recordLookupFallbackFired(candidate, { termId: considerationId, kind: 'noContribution' });
    return 0;
  }
  this.recordLookupFallbackFired(candidate, { termId: considerationId, kind: 'constant', value: fallback.value });
  onContribution?.(fallback.value);
  return fallback.value;
}
```

Important ordering: `hasPreviewRef` branch first (existing), then `hasLookupRef` branch (new), then the legacy `unknownAs ?? 0` path. A consideration with both a preview and a lookup ref would hit the preview branch first; this is acceptable because such considerations are rare and the preview-fallback path semantically subsumes the lookup-fallback path (both emit explicit fallback firings).

### 3. `recordLookupFallbackFired` helper

Mirror `recordPreviewFallbackFired` at `:557-571`:

```ts
private recordLookupFallbackFired(
  candidate: PolicyEvaluationCandidate | undefined,
  fired: PolicyLookupFallbackFired,
): void {
  if (candidate !== undefined) {
    candidate.lookupFallbackFired = fired;
  }
  // No equivalent of input.previewOption?.previewFallbackFired propagation here unless
  // the lookup family is exposed through a similar input contract — verify against
  // the existing input shape during /implement-ticket.
}
```

### 4. Trace export shape

In `kernel/types-core.ts` adjacent to `previewFallbackFired` at `:1782-1786`, add:

```ts
readonly lookupFallbackFired?: {
  readonly termId: string;
  readonly kind: 'noContribution' | 'constant';
  readonly value?: number;
};
```

### 5. Frontier dispatch trace population

In `policy-agent.ts:74-91` (`traceCandidatesForFrontier`) and `:280-310` (structural-frontier dispatch), populate `lookupFallbackFired` from `candidate.lookupFallbackFired` (parallel to the existing `previewFallbackFired` line at `:105`).

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — branch + helper + field)
- `packages/engine/src/kernel/types-core.ts` (modify — trace export shape)
- `packages/engine/src/agents/policy-agent.ts` (modify — frontier dispatch)
- `packages/engine/test/architecture/lookup-refs/lookup-unavailable-not-silently-zero.test.ts` (new)
- `packages/engine/test/architecture/lookup-refs/lookup-fallback-explicit-zero-traced.test.ts` (new)

## Out of Scope

- **No new selection-reason variants** — Spec 163 §4.2 deliberately reuses `tiebreakAfterPreviewNoSignal`. A future unification pass may rename it.
- **No cookbook update** — ticket 005.
- **No fixture profile** — the canonical YAML profile lands in ticket 005.
- **No `unknownAs` deprecation** — `unknownAs` remains the fallback for non-lookup, non-preview unknown values.

## Acceptance Criteria

### Tests That Must Pass

1. `lookup-unavailable-not-silently-zero.test.ts` — construct a microturn whose option-value ID does not name an existing zone in the current state. Every candidate's contribution from the lookup consideration is **omitted** (no entry in `scoreContributions` for that termId). `unknownLookupRefs` lists the ref with reason `missing`. No silent zero. **Foundation #20 invariant for the lookup family.**
2. `lookup-fallback-explicit-zero-traced.test.ts` — same harness with `lookupFallback.onUnavailable: { constant: 0 }`. The contribution exists in `scoreContributions` with value `0`, AND `lookupFallbackFired` records `{ termId, kind: 'constant', value: 0 }`. The explicit fallback is auditable in trace.
3. Existing architecture tests pass: `pnpm -F @ludoforge/engine test:e2e`.
4. Spec 162 witness still passes (regression guard): `node --test dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js`.

### Invariants

1. A consideration with `hasLookupRef === true` AND no `lookupFallback` MUST throw `RUNTIME_EVALUATION_ERROR` at runtime (defense-in-depth — the compiler should have rejected it).
2. `noContribution` fallback MUST omit the contribution from `scoreContributions` AND record `lookupFallbackFired: { kind: 'noContribution' }`. No silent zero entry.
3. `{ constant: N }` fallback MUST add an entry of value `N` to `scoreContributions` AND record `lookupFallbackFired: { kind: 'constant', value: N }`.
4. The trace export's `lookupFallbackFired` field MUST be deterministically populated — same inputs produce the same trace bytes. Determinism asserted by ticket 003's `lookup-determinism.test.ts` (which can extend coverage to fallback-firing as well).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/lookup-refs/lookup-unavailable-not-silently-zero.test.ts` — `// @test-class: architectural-invariant` — Foundation #20 silent-coercion guard. Mirrors `preview-unavailable-not-silently-zero.test.ts`.
2. `packages/engine/test/architecture/lookup-refs/lookup-fallback-explicit-zero-traced.test.ts` — `// @test-class: architectural-invariant` — explicit-fallback trace surface. Mirrors `preview-fallback-explicit-zero-traced.test.ts`.

Both tests reuse the `lookup-refs-fixture.ts` helper authored in ticket 003.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/architecture/lookup-refs/lookup-unavailable-not-silently-zero.test.js dist/test/architecture/lookup-refs/lookup-fallback-explicit-zero-traced.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
