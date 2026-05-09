# 163GENLOOKUP-001: Compiled types + diagnostic codes registry for `lookup` ref family

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `kernel/types-core.ts` (compiled type surface), `cnl/compiler-diagnostic-codes.ts` (registry entries)
**Deps**: `specs/163-generic-microturn-state-feature-lookups.md`

## Problem

Spec 163 introduces a new `lookup` ref discriminant in `CompiledAgentPolicyRef` and a parallel `lookupFallback` field on the compiled consideration shape. Without the static type surface in place, downstream tickets cannot lower YAML, dispatch the resolver, or assert compile-time diagnostics. This ticket lands the type plumbing and registers the two new compiler diagnostic codes that subsequent tickets emit. No behavioral logic is added.

## Assumption Reassessment (2026-05-09)

1. `CompiledAgentPolicyRef` union lives at `packages/engine/src/kernel/types-core.ts:393-443` with 13 existing variants — confirmed during reassessment.
2. `AgentPreviewFallback` (the parallel pre-existing fallback type) is declared at `kernel/types-core.ts:330` and consumed via `previewFallback?: AgentPreviewFallback` on the compiled consideration shape at `:628` and `:823` — confirmed.
3. `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` is registered in `packages/engine/src/cnl/compiler-diagnostic-codes.ts:263` — the new lookup-side codes slot in alongside it.
4. `PreviewOptionRefStatus` (the parallel resolution-status type, introduced by Spec 162) lives in `packages/engine/src/agents/policy-preview-inner.ts:47` — `LookupRefStatus` should adopt the same shape pattern (`{ kind: 'ready'; value } | { kind: 'unavailable'; reason }`).

## Architecture Check

1. **Foundation #1 (Engine Agnosticism)**: The new types describe a generic ref family parameterized by `collection ∈ {zones | tokens | players | globals}`; no game-specific identifiers leak into the kernel type surface.
2. **Foundation #14 (No Backwards Compatibility)**: Adding a new union variant to `CompiledAgentPolicyRef` is a discriminated-union extension. Every existing behavioral consumer that switches on `ref.kind` will be updated to resolve `lookup` in subsequent tickets (003 wires the resolver dispatch). Live build evidence showed `policy-evaluation-core.ts` has an exhaustive `switch`, so this ticket owns a fail-closed type acknowledgement for `case 'lookup'` that throws until the resolver exists. That is compile fallout, not behavioral lookup support.
3. **Foundation #17 (Strongly Typed Domain Identifiers)**: `keyType: 'ZoneId' | 'TokenId' | 'PlayerId' | 'string'` mirrors the branded-type discipline of `MoveParamScalar` (`kernel/types-ast.ts:677`). `'string'` is reserved for `globals` (no `GlobalVarId` brand exists today; runtime existence validation lives in ticket 003).
4. **No new alias paths or compatibility shims** — the lookup family is additive. The legacy `unknownAs ?? 0` path remains unchanged for non-lookup considerations.

## What to Change

### 1. `CompiledAgentLookupRef` union variant

Append to the `CompiledAgentPolicyRef` union at `kernel/types-core.ts:393-443`:

```ts
| {
    readonly kind: 'lookup';
    readonly surface: 'policyState';
    readonly collection: 'zones' | 'tokens' | 'players' | 'globals';
    readonly keyType: 'ZoneId' | 'TokenId' | 'PlayerId' | 'string';
    readonly key: CompiledAgentPolicyExpression;
    readonly path: readonly string[];
    readonly onMissing: 'unavailable' | { readonly kind: 'constant'; readonly value: number | string | boolean };
    readonly onHidden: 'unavailable';
  }
```

### 2. `LookupRefStatus` and `LookupUnavailabilityReason`

Declare adjacent to `PreviewOptionRefStatus` (in `agents/policy-preview-inner.ts` if export-symmetry is preferred, or in `kernel/types-core.ts` if the lookup family is engine-public). Mirror the shape:

```ts
export type LookupUnavailabilityReason = 'hidden' | 'missing' | 'typeMismatch' | 'unresolved';

export type LookupRefStatus =
  | { readonly kind: 'ready'; readonly value: PolicyValue }
  | { readonly kind: 'unavailable'; readonly reason: LookupUnavailabilityReason };
```

### 3. `AgentLookupFallback` type + `lookupFallback` field

Mirror `AgentPreviewFallback` at `kernel/types-core.ts:330`:

```ts
export type AgentLookupFallback = {
  readonly onUnavailable: 'noContribution' | { readonly kind: 'constant'; readonly value: number };
};
```

Add `readonly lookupFallback?: AgentLookupFallback;` to the compiled consideration shape at `:628` and `:823` (immediately after the existing `previewFallback` field at each site).

### 4. Diagnostic codes registry

Register the two new codes in `cnl/compiler-diagnostic-codes.ts` (parallel placement to `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` at `:263`):

```ts
CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK: 'CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK',
CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED: 'CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED',
```

The `CNL_COMPILER_AGENT_LOOKUP_KEY_TYPE_MISMATCH` code is **deliberately NOT registered** — Spec 163 §5 step 2 dropped the static-keyType-check path during reassessment; the runtime resolver returns `unavailable` with reason `typeMismatch` instead.

### 5. Live compile fallout for shared contract mirrors

Live reassessment found two type-contract mirrors that must move in the same Phase 0 slice:

- `schemas-core.ts` mirrors `CompiledAgentPolicyRef` and compiled consideration fallback fields, so the lookup variant and `lookupFallback` schema are part of this ticket.
- `policy-evaluation-core.ts` has an exhaustive `switch (ref.kind)`. This ticket adds only a fail-closed `case 'lookup'` that throws `RUNTIME_EVALUATION_ERROR` until ticket 003 lands the real resolver.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — union extension, `AgentLookupFallback`, `lookupFallback` field on consideration shape, possibly `LookupRefStatus`/`LookupUnavailabilityReason` if engine-public)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — two new code constants)
- `packages/engine/src/kernel/schemas-core.ts` (modify — schema mirror for the compiled union and fallback fields)
- `packages/engine/src/cnl/compile-agents.ts` (modify — preserve `lookupFallback` in the compiled expression-stripped library shape)
- `packages/engine/src/cnl/lower-agent-considerations.ts` (modify — preserve `lookupFallback` in the lowered policy catalog)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — fail-closed compile acknowledgement only; no resolver behavior)
- `packages/engine/src/agents/policy-preview-inner.ts` (verified-no-edit — `LookupRefStatus`/`LookupUnavailabilityReason` are placed in `types-core.ts` as the engine-public lookup contract)

## Out of Scope

- **No compiler lowering** — YAML `value: { lookup: ... }` blocks are not parsed yet (ticket 002).
- **No runtime resolver** — `policy-lookup-surface.ts` is not created (ticket 003).
- **No behavioral dispatch wiring** — ticket 003 owns real lookup resolver dispatch. This ticket may only fail closed if a compiled `lookup` ref reaches the evaluator before ticket 003 lands.
- **No consideration integration** — `evaluateConsideration` does not consume `lookupFallback` yet (ticket 004).
- **No cookbook update** — documentation lands in ticket 005.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` green — the new union variant and types compile without errors.
2. `pnpm turbo typecheck` green — no exhaustiveness regression in the existing `switch (ref.kind)` consumers. Any required acknowledgement in this ticket must fail closed and must not implement real lookup resolution before ticket 003.
3. Existing test suites (engine + runner) pass unchanged: `pnpm turbo test`.

### Invariants

1. The compiled consideration shape MUST carry `previewFallback` AND `lookupFallback` as sibling optional fields — no merging into a unified `fallback` field, no cross-family aliasing.
2. The `keyType` string-literal union MUST contain exactly `'ZoneId' | 'TokenId' | 'PlayerId' | 'string'` — no `'GlobalVarId'` (globals use raw strings; see Foundation #17 alignment in spec 163 §9).
3. The `onHidden` field MUST be the literal `'unavailable'` only — no override variant (compile-time enforcement of Foundation #4 lands in ticket 002 via `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED`).

## Test Plan

### New/Modified Tests

1. No new tests in this ticket — types and registry constants have no behavioral surface to assert. Ticket 002 adds the first behavioral tests (compile-time diagnostics).

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`

## Implementation Outcome

Completed 2026-05-09.

- Boundary reset approved 2026-05-09: choose the Foundation-aligned fail-closed acknowledgement in `policy-evaluation-core.ts` over a generic default fallback or leaving the ticket in a broken mid-migration state.
- Landed owned Phase 0 surface:
  - `CompiledAgentPolicyRef` includes `kind: 'lookup'` with `surface`, `collection`, `keyType`, `key`, `path`, `onMissing`, and literal-only `onHidden`.
  - `LookupUnavailabilityReason`, `LookupRefStatus`, and `AgentLookupFallback` live in `types-core.ts`.
  - compiled consideration shapes carry sibling optional `previewFallback` and `lookupFallback` fields.
  - `compile-agents.ts` and `lower-agent-considerations.ts` preserve `lookupFallback` through existing compiled-library and lowered-catalog copy paths.
  - `compiler-diagnostic-codes.ts` registers `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` and `CNL_COMPILER_AGENT_LOOKUP_HIDDEN_OVERRIDE_REJECTED`; no key-type-mismatch code was added.
  - `schemas-core.ts` and generated `GameDef.schema.json` mirror the new compiled union/fallback surface.
  - `policy-evaluation-core.ts` has a fail-closed `case 'lookup'` only; ticket 003 still owns real resolver dispatch and observer routing.
- Verified-no-edit: `policy-preview-inner.ts` was not changed because the lookup status types are engine-public in `types-core.ts`.
- Generated fallout: `packages/engine/schemas/GameDef.schema.json` changed; `Trace.schema.json` and `EvalReport.schema.json` were regenerated unchanged.
- Source-size ledger: `types-core.ts` is a preexisting oversized canonical contract hub; extraction would widen this staged type-surface ticket, so the surgical addition is retained with no separate extraction owner.
- Deferred sibling scope: 002 owns YAML lowering and diagnostics; 003 owns runtime resolver/behavioral dispatch; 004 owns consideration integration and trace; 005 owns cookbook and fixture profile.
- Final proof:
  - `pnpm turbo build` — passed
  - `pnpm turbo schema:artifacts` — passed; regenerated `GameDef.schema.json`, with `Trace.schema.json` and `EvalReport.schema.json` unchanged
  - `pnpm turbo typecheck` — passed
  - `pnpm turbo test` — passed
  - `pnpm run check:ticket-deps` — passed
- No-invalidation: terminal status/proof/checker-result transcription only after green final lanes; no scope, acceptance, command, touched-file, follow-up, or dependency change.
