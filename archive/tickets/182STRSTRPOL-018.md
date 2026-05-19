# 182STRSTRPOL-018: Phase 3 — Define and implement guardrail ref contract

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — Spec 182 ref table, `CompiledAgentPolicyRef`, compiler lowering/diagnostics, runtime resolution, tests
**Deps**: `archive/tickets/182STRSTRPOL-007.md`, `archive/tickets/182STRSTRPOL-009.md`

## Problem

Ticket 007's draft named `guardrail.<id>.*` ref resolution, but Spec 182 currently defines module refs (§4.3) and turn-shape refs (§6.3) without defining a guardrail ref table or a `CompiledAgentPolicyRef` variant. Implementing `guardrail.<id>.*` directly inside ticket 007 would have invented a public compiler/runtime contract without a spec-owned shape, which conflicts with Foundations #12 and #15.

This ticket defines the missing guardrail ref contract first, then implements it comprehensively across parser/compiler/runtime/tests.

## Assumption Reassessment (2026-05-19)

1. Live code already contains the Phase 3 guardrail library bucket, dispatch, pass-fallback, and trace surfaces from archived tickets 006-009; the missing seam is specifically `guardrail.<id>.*` as a compiled policy ref.
2. Spec 182 still lacked a guardrail ref table before this ticket; the spec-owned table is added here before compiler/runtime behavior relies on the public ref names.
3. Runtime dispatch already caches guardrail predicate evaluation in `PolicyEvaluationContext`; this ticket extends the dispatch result with a ref view so downstream refs read the cached result instead of re-evaluating predicates.
4. Source-size boundary: `types-core.ts`, `schemas-core.ts`, `compile-agents.ts`, and `policy-evaluation-core.ts` were pre-existing oversized registry/core files before this ticket. User approved option 2 on 2026-05-19: keep the minimal registry edits here, record this source-size ledger, and defer any broader extraction to future refactor ownership rather than widening ticket 018.

## Architecture Check

1. Foundation #12: every static ref name, field type, and unknown-ref diagnostic must be compiler-owned; the runtime only resolves compiled guardrail refs.
2. Foundation #15: the contract must be complete enough for downstream consumers, not a one-off helper for a single test.
3. Foundation #16: each supported ref has compiler diagnostics and runtime behavior covered by automated tests.
4. Foundation #20: any ref exposing preview-unavailable behavior must preserve the declared fallback path and readiness status; no unavailable preview signal may become an implicit scalar.

## What to Change

### 1. Spec 182 ref table

Add a guardrail refs section near Spec 182 §5.7 defining the initial surface. Suggested minimum:

| Ref | Type | Available in scope |
| --- | --- | --- |
| `guardrail.<id>.fired` | boolean | downstream considerations / tie-breakers / turn-shape predicates after guardrail dispatch |
| `guardrail.<id>.severity` | id/string | downstream trace-facing consumers |
| `guardrail.<id>.status` | id/string (`ready` / `partial` / `unavailable`) | downstream trace-facing consumers |
| `guardrail.<id>.penalty` | number | downstream consumers; zero when unset/not applicable |
| `guardrail.<id>.onUnavailable` | id/string (`warnUnknown` / `noFire` / `fire`) | downstream consumers that need fallback provenance |

Confirm exact field names during implementation and keep them stable across spec, compiler, runtime, and tests.

### 2. Compiler/type contract

- Add a `guardrail` `CompiledAgentPolicyRef` variant in `packages/engine/src/kernel/types-core.ts`.
- Extend schema validation in `packages/engine/src/kernel/schemas-core.ts`.
- Extend CNL lowering/ref parsing for `guardrail.<id>.*`.
- Emit a specific unknown guardrail/unknown field diagnostic instead of allowing a generic runtime miss.
- Include dependency tracking so guardrail refs participate in cycle checks.

### 3. Runtime resolution

In `packages/engine/src/agents/policy-evaluation-core.ts`, resolve compiled guardrail refs from the per-decision guardrail evaluation view/trace produced by ticket 007/009. The runtime must not re-evaluate guardrail predicates when resolving refs.

### 4. Tests

- Compiler positive and negative tests for every accepted field and at least one unknown field/unknown id failure.
- Runtime test proving a downstream consideration can read at least `guardrail.<id>.fired` and `guardrail.<id>.status` without re-running the guardrail predicate.
- Foundation #20 test proving `guardrail.<id>.onUnavailable` preserves `warnUnknown` vs `noFire` vs `fire`.
- Determinism test or existing replay proof for a profile that reads guardrail refs.

## Acceptance Criteria

1. Spec 182 contains the guardrail ref table and names the lifecycle point where guardrail refs become available.
2. `CompiledAgentPolicyRef` and JSON schemas include the new guardrail ref variant.
3. Compiler diagnostics cover unknown guardrail id, unknown field, and dependency cycles.
4. Runtime resolves guardrail refs from cached guardrail dispatch state, not by re-evaluating guardrails.
5. Tests prove Foundation #20 fallback provenance for guardrail refs.

## Test Plan

1. `pnpm -F @ludoforge/engine build`
2. Focused compiler/runtime guardrail ref tests added by this ticket.
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19

What changed:

1. Spec 182 now defines the `guardrail.<id>.*` ref table and states that guardrail refs become available after guardrail dispatch and before downstream scoring.
2. `CompiledAgentPolicyRef` and `GameDef.schema.json` now include the `guardrail` ref variant with fields `fired`, `severity`, `status`, `penalty`, and `onUnavailable`.
3. CNL lowering parses and validates `guardrail.<id>.*` refs, records guardrail dependencies for cycle checks, and reports `CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN` for unknown ids or unsupported fields.
4. Runtime resolution reads guardrail refs from the current dispatch `refView`; it does not re-evaluate guardrail predicates when downstream considerations read those refs.
5. Tests cover positive lowering/dependency tracking, unknown id/field diagnostics, downstream runtime scoring from `fired` + `penalty`, fallback provenance through `onUnavailable` / `status`, and the no-rerun cache invariant.

Deviations:

- Source-size deferral approved by user on 2026-05-19: `types-core.ts`, `schemas-core.ts`, `compile-agents.ts`, and `policy-evaluation-core.ts` were pre-existing oversized registry/core files. This ticket keeps the minimal registry edits required for the guardrail ref contract and does not extract those files in-scope.

Source-size ledger:

| Path | Before/after classification | Active growth | Decision |
| --- | --- | ---: | --- |
| `packages/engine/src/kernel/types-core.ts` | pre-existing oversized registry file | +10 lines | approved deferral |
| `packages/engine/src/kernel/schemas-core.ts` | pre-existing oversized registry file | +11 lines | approved deferral |
| `packages/engine/src/cnl/compile-agents.ts` | pre-existing oversized compiler registry file | +19 lines | approved deferral |
| `packages/engine/src/agents/policy-evaluation-core.ts` | pre-existing oversized runtime core file | +43 lines | approved deferral |
| `packages/engine/src/agents/policy-guardrail-eval.ts` | under guidance | +57 lines | no extraction needed |
| `packages/engine/src/cnl/compile-agent-guardrails.ts` | under guidance | +26 lines | no extraction needed |

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test packages/engine/dist/test/unit/cnl/agent-guardrail-diagnostics.test.js packages/engine/dist/test/unit/agents/guardrail-severity-dispatch.test.js` — passed, 13 tests.
3. `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after regenerating `packages/engine/schemas/GameDef.schema.json`.
4. `pnpm turbo test` — passed, 5 tasks successful.
5. `pnpm turbo lint` — passed, 2 tasks successful.
6. `pnpm turbo typecheck` — passed, 3 tasks successful.
