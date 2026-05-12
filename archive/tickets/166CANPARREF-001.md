# 166CANPARREF-001: Compiled types + schema + diagnostic codes for candidateParam ref family

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, `packages/engine/src/cnl/compiler-diagnostic-codes.ts`
**Deps**: `archive/specs/166-candidate-parameter-refs.md`

## Problem

Spec 166 §4.1 / §4.4 / §5.7 extends the `CompiledAgentPolicyRef.candidateParam` discriminant with an `onMissing: 'unavailable' | { kind: 'constant'; value }` field and an optional `appliesToActions?: readonly string[]` field. Phases 1–5 (parser, fallback collector, runtime resolver, trace plumbing, FITL declarations) all consume these shared compiled-type and schema additions, and reference six new diagnostic codes that must be registered in the shared registry before any of those phases can compile. This ticket establishes the cross-cutting type/schema/diagnostic foundation so Phases 1 and 3 (tickets 002 and 004) can proceed in parallel.

## Assumption Reassessment (2026-05-11)

1. `CompiledAgentPolicyRef.candidateParam` discriminant exists at `packages/engine/src/kernel/types-core.ts:413-416` as `{ readonly kind: 'candidateParam'; readonly id: string }`. Verified — exact shape confirmed.
2. Zod schema mirror lives at `packages/engine/src/kernel/schemas-core.ts:687-689`. Verified — spec anchor accurate.
3. Diagnostic code registry is `packages/engine/src/cnl/compiler-diagnostic-codes.ts`. Verified — `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` is registered at `:244` and `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` at `:269`. The codes added here mirror that naming convention.
4. Spec 166 §5.1 enumerates six new diagnostic codes. All use the `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_*` prefix (plural — distinct from the existing singular `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID`).
5. `CompiledAgentCandidateParamDef` at `packages/engine/src/kernel/types-core.ts:802-808` carries the `'number' | 'boolean' | 'id' | 'idList'` discriminant the runtime resolver and the lowering type-check both consult. No shape change to this type is required by this ticket.

## Architecture Check

1. **One extension point, many consumers.** Establishing the shared type/schema/diagnostic foundation in a single bounded ticket avoids splintering identical type-shape edits across Phase-1/Phase-3/Phase-5 tickets and gives downstream tickets a single import boundary. This mirrors the foundational-types pattern Spec 163 and Spec 165 used.
2. **No backwards-compatibility aliasing.** The extension adds optional fields (`onMissing`, `appliesToActions`) to the existing `candidateParam` discriminant. No alias path for the retired singular `candidate.param.*`; the existing `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` (singular) is preserved verbatim. Foundation #14 honored.
3. **Generic, agnostic schema.** The new fields are game-agnostic: `onMissing` is a typed-scalar constant union; `appliesToActions` is an optional `readonly string[]` of action ids. No FITL-specific identifiers leak into the type system. Foundation #1 / #6 honored.
4. **Compiler-kernel validation boundary preserved (Foundation #12).** Type extensions and diagnostic codes are compile-time artifacts only; this ticket adds no runtime branching or new kernel invariants.

## What to Change

### 1. Extend `CompiledAgentPolicyRef.candidateParam` discriminant

`packages/engine/src/kernel/types-core.ts:413-416` — replace the current shape with:

```ts
| {
    readonly kind: 'candidateParam';
    readonly id: string;
    readonly onMissing:
      | 'unavailable'
      | { readonly kind: 'constant'; readonly value: number | string | boolean };
    readonly appliesToActions?: readonly string[];
  }
```

The `onMissing` field is required (not optional) — Phase 1's parser path (ticket 002) sets it explicitly to `'unavailable'` when no `onMissing` is supplied in YAML. The `appliesToActions` field is optional and absent when the consideration does not constrain the candidate-param to a specific action set.

### 2. Mirror in zod schema

`packages/engine/src/kernel/schemas-core.ts:687-689` — extend the `candidateParam` branch of the `CompiledAgentPolicyRefSchema` discriminated union to mirror the type:

- `onMissing`: discriminated union accepting either `z.literal('unavailable')` or `z.object({ kind: z.literal('constant'), value: z.union([z.number(), z.string(), z.boolean()]) })`.
- `appliesToActions`: `z.array(z.string()).optional()` (use the existing branded `StringSchema` if the file uses one for action ids).

Add a co-located JSDoc note pointing at Spec 166 §4.1 for the authoring surface.

### 3. Register six new compiler diagnostic codes

`packages/engine/src/cnl/compiler-diagnostic-codes.ts` — append the following entries to the `CNL_COMPILER_DIAGNOSTIC_CODES` const map alongside the existing `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` and `CNL_COMPILER_AGENT_LOOKUP_REF_REQUIRES_EXPLICIT_FALLBACK` neighbours:

| Identifier (key === value) | Used by ticket | Fires when (per Spec 166 §5.1) |
|---|---|---|
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN` | 002 | `candidate.params.<paramName>` references a param not in `candidateParamDefs`. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID` | 002 | `candidate.params.*` appears in a microturn-scope consideration. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION` | 002 | `appliesToActions` lists an action that does not exist in compiled `GameDef.actions`. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT` | 002 | The referenced param's compiled def was dropped by `lowerCandidateParamDefs` due to cross-action type disagreement. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH` | 002 | An `onMissing: { kind: 'constant'; value }` provides a value whose type does not match the declared param type. |
| `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_REQUIRES_EXPLICIT_FALLBACK` | 003 | A consideration's `value` reads a `candidate.params.*` ref with `onMissing: 'unavailable'` and `candidateParamFallback` is omitted. |

Do NOT wire these codes into any compile-agents.ts emit site in this ticket — tickets 002 and 003 own the emit sites. This ticket only registers the names so downstream tickets can import them and so any cross-validation that enumerates the registry (e.g., `cross-validate-diagnostic-codes.ts` if it scans the registry) does not regress.

### 4. Build/typecheck assertion

Run `pnpm turbo build` and `pnpm turbo typecheck`. Both must remain green. No new emit-site references exist yet, so no usage-site compile errors should appear. Any TypeScript exhaustiveness failures in switch statements over `CompiledAgentPolicyRef` (resolver, VM, evaluation core) will surface here — they are addressed by ticket 004 (resolver + VM dispatch). If exhaustiveness regressions appear, defer them to ticket 004 by adding a TODO-style `case 'candidateParam'` that returns the previous behavior unchanged (still consults `id` only, ignores `onMissing`). This keeps the build green without introducing premature semantics; ticket 004 then upgrades the dispatch.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)

## Out of Scope

- Parser / lowering changes for `candidate.params.<name>` — owned by ticket 002.
- Required-fallback collector and consideration-level `candidateParamFallback` lowering — owned by ticket 003.
- Runtime resolver `onMissing` constant-fallback path, trace `unknownCandidateParamRefs` map, VM dispatch update — owned by ticket 004.
- Cookbook documentation — owned by ticket 007.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — clean across all packages.
2. `pnpm turbo typecheck` — no new type errors. Any pre-existing exhaustiveness errors that surface only because the discriminant grew are addressed via the minimal pass-through `case 'candidateParam'` patch noted in §4 (deferred semantics to ticket 004).
3. Existing suite: `pnpm turbo test` — every existing test continues to pass; no behavioral change is introduced here.

### Invariants

1. The retired singular form `candidate.param.<name>` continues to be rejected with `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` (existing diagnostic, unchanged). No alias / shim added.
2. Schema-as-source-of-truth: any compiled `CandidateParam` ref serialized through the zod schema round-trips byte-identically across `onMissing` and (when present) `appliesToActions`. Foundation #8 / Foundation #13.

## Test Plan

### New/Modified Tests

This ticket is type-and-registry plumbing with no new functional surface; no new test files are authored here. The architectural-invariant suite added by tickets 002–006 exercises the new types end-to-end. The existing schema round-trip suite (`packages/engine/test/schemas/` or analogous) covers the zod-schema invariant once any tickets 002–004 emit a compiled ref carrying the new fields.

If the build surfaces an exhaustiveness check at a `case 'candidateParam'` site that this ticket does not patch through correctly, add a focused architectural-invariant test under `packages/engine/test/architecture/candidate-param-refs/candidate-params-discriminant-roundtrip.test.ts` that constructs a compiled ref with each `onMissing` shape and runs it through `schemas-core` parse-then-serialize — this is optional and only authored if a regression is observed.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
4. `pnpm run check:ticket-deps`

## Outcome

Completion date: 2026-05-11
Outcome amended: 2026-05-12

What landed:

- `packages/engine/src/kernel/types-core.ts` extends `CompiledAgentPolicyRef`'s `candidateParam` branch with required `onMissing` and optional `appliesToActions`, and reuses the same scalar missing-policy type for lookup refs.
- `packages/engine/src/kernel/schemas-core.ts` mirrors the compiled `candidateParam` shape and keeps `onMissing` required in the serialized compiled schema.
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` registers the six Spec 166 candidate-param diagnostic codes.
- Type-only handwritten fixture fallout was updated so existing tests that manually construct compiled `candidateParam` refs use `onMissing: 'unavailable'`, preserving current behavior until tickets 002-004 add parser/runtime semantics.

Touched-file scope correction:

- The original `Files to Touch` list named only the three shared source files. Final touched scope also includes `packages/engine/schemas/GameDef.schema.json` as generated schema fallout, plus existing engine tests/helpers that manually author the now-required compiled ref field. This is Foundation #14 shared-contract fallout, not behavioral scope expansion.

Generated fallout:

- `pnpm -F @ludoforge/engine run schema:artifacts:check` initially reported `GameDef.schema.json` out of sync.
- `pnpm -F @ludoforge/engine run schema:artifacts` rewrote `GameDef.schema.json`; `Trace.schema.json` and `EvalReport.schema.json` were byte-identical after generation.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` then passed.

Deferred sibling/spec scope:

- Parser acceptance and compile-time validation were completed and archived at `archive/tickets/166CANPARREF-002.md`.
- Required fallback lowering remains owned by `tickets/166CANPARREF-003.md`.
- Runtime resolver, VM mirror, and trace plumbing remain owned by `tickets/166CANPARREF-004.md` and `tickets/166CANPARREF-005.md`.
- FITL action-data is completed in `archive/tickets/166CANPARREF-006.md`; cookbook work is completed in `archive/tickets/166CANPARREF-007.md`.

Source-size ledger:

- `packages/engine/src/kernel/types-core.ts | before 2185 | after 2190 | crossed cap? no, preexisting oversize | active growth +5 | canonical contract hub; extraction would obscure this ticket seam | successor none`
- `packages/engine/src/kernel/schemas-core.ts | before 2603 | after 2612 | crossed cap? no, preexisting oversize | active growth +9 | canonical schema mirror; extraction would obscure this ticket seam | successor none`

Final verification:

- `pnpm turbo build` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts` — regenerated schema artifacts after the root build refreshed engine `dist`.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after regeneration and remained green after the broad test lane.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — passed.
- `pnpm run check:ticket-deps` — passed for 7 active tickets and 2302 archived tickets.

The terminal status/proof transcription is documentation-only and does not change source, schema, or test behavior; no broad proof invalidation follows from this ticket-text update.

Post-ticket review (2026-05-11): no must-fix cleanup, reopen item, or new follow-up ticket was warranted. Remaining parser/runtime/FITL/cookbook work was already owned by sibling tickets `166CANPARREF-002` through `166CANPARREF-007`; those siblings are now archived.
