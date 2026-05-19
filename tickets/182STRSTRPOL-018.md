# 182STRSTRPOL-018: Phase 3 — Define and implement guardrail ref contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — Spec 182 ref table, `CompiledAgentPolicyRef`, compiler lowering/diagnostics, runtime resolution, tests
**Deps**: `archive/tickets/182STRSTRPOL-007.md`, `archive/tickets/182STRSTRPOL-009.md`

## Problem

Ticket 007's draft named `guardrail.<id>.*` ref resolution, but Spec 182 currently defines module refs (§4.3) and turn-shape refs (§6.3) without defining a guardrail ref table or a `CompiledAgentPolicyRef` variant. Implementing `guardrail.<id>.*` directly inside ticket 007 would have invented a public compiler/runtime contract without a spec-owned shape, which conflicts with Foundations #12 and #15.

This ticket defines the missing guardrail ref contract first, then implements it comprehensively across parser/compiler/runtime/tests.

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
