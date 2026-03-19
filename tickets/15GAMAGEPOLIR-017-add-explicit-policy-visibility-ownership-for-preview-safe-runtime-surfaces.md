# 15GAMAGEPOLIR-017: Add Explicit Policy Visibility Ownership for Preview-Safe Runtime Surfaces

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — shared policy visibility contracts, compiler/runtime visibility classification, preview masking refinement
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-004-add-policy-visibility-metadata-and-canonical-seat-binding-validation.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-007-implement-policy-preview-runtime-and-hidden-info-masking.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-014-make-policy-metric-refs-executable-through-generic-runtime-contracts.md

## Problem

The current preview runtime is intentionally conservative: if preview safety cannot be proven generically, the whole preview surface collapses to `unknown`. That is safe, but it is not the final architecture Spec 15 calls for. The runtime still lacks explicit, shared ownership metadata for which policy-visible surfaces are public, acting-seat-visible, hidden, or preview-safe after a one-ply move. Without that contract, imperfect-information policy behavior remains sound only through broad masking, not through precise generic visibility reasoning.

## Assumption Reassessment (2026-03-19)

1. Archived ticket 004 deliberately kept policy visibility as an allowlist boundary and did not add fine-grained visibility metadata for `var.*`, `metric.*`, `victory.*`, or other policy-visible surfaces.
2. Archived ticket 007 implemented preview execution with conservative masking, but that ticket explicitly did not claim per-ref visibility ownership because the underlying contracts do not exist yet.
3. Texas Hold'em authoring and long-term preview diagnostics need a stronger generic contract than “mask everything when hidden sampling exists”; otherwise imperfect-information policies will be forced into avoid-preview authoring even when some preview refs are actually safe.
4. Corrected scope: this ticket must add explicit generic visibility ownership to the shared authored/compiled/runtime surfaces and refine preview masking to use that ownership. It must not add game-specific exceptions, visual-config dependencies, or backwards-compatibility alias paths.

## Architecture Check

1. A shared visibility contract owned by authored/compiled runtime surfaces is cleaner than teaching `policy-preview.ts` bespoke per-game masking rules or hardcoding Texas Hold'em card semantics into the engine.
2. This preserves the repository boundary: game-specific semantics stay in `GameSpecDoc`/authored data, while `GameDef`, compiler lowering, and runtime preview masking remain game-agnostic.
3. Replacing the current coarse masking with explicit per-surface visibility ownership is more robust and extensible than expanding ad hoc preview exceptions one ref at a time.
4. No backwards-compatibility shims, alias visibility labels, or legacy duplicate paths should be introduced. Existing contracts should be upgraded directly.

## What to Change

### 1. Add shared visibility ownership metadata to policy-visible authored and compiled surfaces

Extend the generic contracts for policy-visible surfaces so the compiler/runtime can classify current-state and preview-state visibility without guessing.

This includes, as applicable:

- global and seat-scoped vars
- derived metrics
- victory surfaces
- any other policy-visible authored runtime metadata intentionally exposed to policy

Each surface must declare enough generic information to answer:

- public vs acting-seat-visible vs hidden
- whether preview remains deterministic after one-ply application
- whether the surface can be read after preview even when other parts of the state remain hidden

### 2. Refine compiler/runtime policy visibility classification around the shared contract

Update policy compilation and preview resolution so:

- compile-time ref validation knows whether a ref is policy-visible and preview-safe by shared contract, not by ad hoc string allowlists alone
- preview masking resolves `unknown` only for refs whose visibility/determinism contract says it must, instead of collapsing the whole preview surface whenever any hidden sampling remains elsewhere
- diagnostics can report exact visibility/preview classifications from the shared contract

### 3. Strengthen imperfect-information integration and invariant coverage

Add focused tests proving:

- per-ref preview masking in mixed states with both safe and unsafe surfaces
- Texas-style hidden information does not leak
- safe preview refs remain usable even when unrelated hidden state exists

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify if authored visibility metadata is required)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify if shared visibility metadata is lowered there)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify if shared compiled contract shape changes)
- `packages/engine/src/kernel/derived-values.ts` (modify if metric visibility ownership lives there)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify only if runtime ref handling needs contract plumbing)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify)
- `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` (modify or new, depending on ticket order)

## Out of Scope

- authoring new FITL or Texas policy heuristics beyond what is needed to prove the visibility contract
- `PolicyAgent` factory/runner descriptor migration
- trace presentation redesign beyond reporting the refined shared visibility classifications
- visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-preview.test.ts` proves preview masking is per-ref and contract-driven: safe preview refs stay available while unsafe refs resolve to `unknown`.
2. `packages/engine/test/unit/property/policy-visibility.test.ts` proves two states that differ only in acting-seat-invisible hidden data still produce identical policy outcomes, while mixed safe/unsafe preview refs behave according to the shared visibility contract.
3. `packages/engine/test/unit/compile-agents-authoring.test.ts` proves unsupported preview-unsafe refs are rejected or classified deterministically from the shared contract.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Preview visibility and determinism are owned by one shared generic contract from authoring/compiled data through runtime evaluation.
2. Game-specific hidden-information semantics remain authored in `GameSpecDoc` data, not hardcoded into engine branches.
3. Safe preview refs remain usable even in imperfect-information games when unrelated hidden state exists elsewhere.
4. `visual-config.yaml` remains presentation-only and cannot influence policy visibility semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — per-ref preview visibility and masking rationale.
2. `packages/engine/test/unit/property/policy-visibility.test.ts` — mixed-surface invariance and hidden-info safety.
3. `packages/engine/test/unit/compile-agents-authoring.test.ts` — compile-time visibility classification ownership.
4. `packages/engine/test/integration/texas-holdem-policy-agent.test.ts` — imperfect-information integration proof once authored policies depend on the refined contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`
