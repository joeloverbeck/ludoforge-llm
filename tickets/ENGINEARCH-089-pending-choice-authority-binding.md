# ENGINEARCH-089: Pending-Choice Authority Binding and Replay Safety

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel choice request contract and decision validation pipeline
**Deps**: tickets/ENGINEARCH-088-decision-authority-context-hardening.md

## Problem

Pending choices are identified by `decisionId`, but resolution currently lacks a strong binding between pending request identity and authority context. This leaves room for stale or replayed decision payloads in multi-step flows.

## Assumption Reassessment (2026-02-27)

1. Pending requests expose decision metadata but do not include a dedicated authority/session binding token.
2. Resolution validates values against option domains, but identity/provenance binding between request and resolver is minimal.
3. Mismatch: domain validation exists, but replay/authority binding is weak. Corrected scope is to add explicit pending-choice binding contracts in engine-generic terms.

## Architecture Check

1. Explicit pending-choice binding tokens create deterministic, auditable decision sequencing.
2. The token model is runtime-generic and does not encode any game-specific identifiers.
3. No compatibility shims: adopt a single canonical choice-resolution contract.

## What to Change

### 1. Add pending-choice binding token

Add a deterministic `decisionContextId` (or equivalent) to pending requests and require it for resolution-bearing move params or context payloads.

### 2. Validate resolver payload against binding token

Reject resolution attempts when decision id, token, and authority context do not align with the current pending request state.

### 3. Keep deterministic behavior under probing

Ensure move-decision-sequence probing and legality evaluation preserve deterministic behavior with the new token.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/decision-id.ts` (modify if needed)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify/add)
- `packages/engine/test/unit/apply-move.test.ts` (modify/add)

## Out of Scope

- Network/session transport APIs.
- Persisted save-game migration paths.

## Acceptance Criteria

### Tests That Must Pass

1. Pending requests include binding token metadata and resolution requires token match.
2. Stale/replayed decision payloads are rejected deterministically.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Decision binding contracts remain game-agnostic and deterministic.
2. Choice resolution preserves existing option-domain legality semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — token emission and mismatch rejection.
2. `packages/engine/test/unit/apply-move.test.ts` — replay/stale decision rejection on apply path.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — deterministic probing with binding token.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
4. `node --test packages/engine/dist/test/unit/apply-move.test.js`
5. `pnpm -F @ludoforge/engine test`
