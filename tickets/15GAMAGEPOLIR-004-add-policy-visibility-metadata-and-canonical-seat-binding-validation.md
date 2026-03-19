# 15GAMAGEPOLIR-004: Add Policy Visibility Metadata and Canonical Seat Binding Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler/kernel visibility and seat-resolution contracts
**Deps**: specs/15-gamespec-agent-policy-ir.md, tickets/15GAMAGEPOLIR-001-add-authored-agents-section-to-gamespecdoc.md, tickets/15GAMAGEPOLIR-002-lower-agent-parameters-profiles-and-bindings.md

## Problem

Spec 15 explicitly forbids hidden-information leaks and player-index-based seat semantics. Until the engine classifies policy-visible authored surfaces and validates bindings against resolved canonical seat ids, compiled policies can still cheat or bind incorrectly.

## Assumption Reassessment (2026-03-19)

1. The current repo already has seat-related compiler/kernel modules, but Spec 15 adds stricter seat-based binding requirements for policy compilation.
2. Existing vars/metrics/victory surfaces may not yet carry enough generic visibility metadata for policy-safe ref classification.
3. Corrected scope: this ticket should add the prerequisite visibility and seat contracts. It should not yet implement preview execution or full policy evaluation.

## Architecture Check

1. Extending generic visibility metadata is cleaner than carving out policy-only exceptions that expose raw game state.
2. Resolving bindings against canonical seats preserves authored seat semantics across scenario selection and prevents player-order coupling.
3. No game-specific visibility branches or seat remapping hacks should be introduced.

## What to Change

### 1. Extend authored/runtime surfaces with generic visibility classification

Add the minimum metadata required for policy compilation to classify refs as:

- `public`
- `seatVisible`
- `hidden`

Apply this generically to the authored surfaces policies are allowed to read.

### 2. Validate policy refs against the visible surface

Reject policy refs that target:

- hidden data
- visual config/presentation metadata
- raw state traversal not surfaced as vars/metrics/public metadata

### 3. Bind authored policies against canonical resolved seats

Validate bindings only after scenario/seat-catalog resolution and reject:

- missing seat catalog resolution
- authored bindings for absent seats
- unresolved seat-scoped refs

## File List

- `packages/engine/src/cnl/seat-identity-contract.ts` (modify)
- `packages/engine/src/cnl/scenario-projection-invariants.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/kernel/seat-resolution.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify if needed for visibility metadata)
- `packages/engine/test/unit/cnl/compile-agents-visibility.test.ts` (new)
- `packages/engine/test/unit/kernel/seat-resolution-policy.test.ts` (new)

## Out of Scope

- preview caching/execution
- score/pruning runtime
- runner UI changes
- FITL/Texas authored baseline profiles

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/cnl/compile-agents-visibility.test.ts` rejects hidden or preview-unsafe refs and rejects any attempt to reference `visual-config.yaml` data or presentation-only metadata.
2. `packages/engine/test/unit/kernel/seat-resolution-policy.test.ts` proves policy bindings resolve against canonical scenario-selected seat ids and reject absent/ambiguous seat catalogs.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Hidden information unavailable to the acting seat is not admitted into compiled policy refs.
2. Policy semantics are seat-based, not player-index-based.
3. `visual-config.yaml` remains presentation-only and cannot influence policy compilation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents-visibility.test.ts` — visibility and forbidden-ref coverage.
2. `packages/engine/test/unit/kernel/seat-resolution-policy.test.ts` — canonical seat resolution and binding rejection paths.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
