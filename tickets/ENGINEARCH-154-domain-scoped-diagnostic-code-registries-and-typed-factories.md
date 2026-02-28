# ENGINEARCH-154: Introduce Domain-Scoped Diagnostic Code Registries and Typed Factories

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — cross-module diagnostic taxonomy contract hardening in kernel/cnl
**Deps**: archive/tickets/ENGINEARCH-153-choice-options-diagnostic-code-contract-single-source-derivation.md

## Problem

Most diagnostics across kernel/cnl still rely on open `string` code assignment. This allows taxonomy drift outside locally hardened helpers and weakens compile-time ownership of diagnostic contracts.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/diagnostics.ts` defines `Diagnostic.code` as `string`.
2. Multiple modules currently emit diagnostic codes as ad-hoc string literals or string-typed registry fields.
3. Mismatch: architecture intends deterministic diagnostic taxonomy, but enforcement is inconsistent. Corrected scope is to introduce explicit domain-scoped code registries and typed diagnostic creation surfaces that reduce open-string usage.

## Architecture Check

1. Domain-scoped typed registries/factories are cleaner and more extensible than ad-hoc string literals spread across modules.
2. This is engine-generic contract hardening only; no game-specific behavior/data enters GameDef/runtime/simulation.
3. No backwards-compatibility aliases/shims; migrate directly to typed ownership in touched domains.

## What to Change

### 1. Establish typed code registries for selected diagnostic domains

Create canonical `as const` code registries (or equivalent typed contract modules) for at least one compiler domain and one validator/kernel domain as initial ownership anchors.

### 2. Introduce typed diagnostic construction helpers for those domains

Replace direct ad-hoc `code: '...'` writes in touched domains with typed factory/helper APIs that only accept registered codes.

### 3. Migrate targeted call sites incrementally

Update a bounded set of modules/tests to consume the new typed surfaces without broad rewrite.

## Files to Touch

- `packages/engine/src/kernel/diagnostics.ts` (modify if needed for typed factory support)
- `packages/engine/src/kernel/` (new/modify domain code registry module(s))
- `packages/engine/src/cnl/` (new/modify domain code registry module(s))
- `packages/engine/src/kernel/action-selector-contract-registry.ts` (modify only if included in initial migration slice)
- `packages/engine/src/cnl/cross-validate.ts` (modify only if included in initial migration slice)
- `packages/engine/src/cnl/compile-lowering.ts` (modify only if included in initial migration slice)
- `packages/engine/test/unit/` (modify relevant tests for migrated domains)

## Out of Scope

- Full-repo diagnostic-code migration in one ticket.
- Runtime behavior changes unrelated to diagnostic contract typing.
- Any GameSpecDoc or visual-config content/schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. At least two diagnostic domains (compiler + validator/kernel) use explicit typed code ownership (registry + typed constructor usage).
2. Migrated call sites no longer assign free-form diagnostic code strings.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Diagnostic taxonomy in migrated domains is compile-time constrained and centrally owned.
2. Engine behavior remains game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/` domain tests for migrated modules — assert existing diagnostic payload behavior remains stable after typed-constructor migration.
2. Add/strengthen type-facing regression checks where practical (for example compile-time guarded usage patterns in touched modules).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`
