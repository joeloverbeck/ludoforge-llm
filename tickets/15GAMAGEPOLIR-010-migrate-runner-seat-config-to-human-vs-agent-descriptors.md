# 15GAMAGEPOLIR-010: Migrate Runner Seat Config to Human-vs-Agent Descriptors

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only wiring on top of engine descriptors
**Deps**: specs/15-gamespec-agent-policy-ir.md, tickets/15GAMAGEPOLIR-009-migrate-engine-agent-selection-to-structured-descriptors.md

## Problem

The runner still stores seat types as `'human' | 'ai-random' | 'ai-greedy'`, which bakes engine implementation details into UI/store/session contracts and blocks authored-policy defaults from becoming the normal non-human path.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/store/store-types.ts`, `session/session-types.ts`, `store/ai-move-policy.ts`, and `ui/PreGameConfigScreen.tsx` still use the legacy AI seat strings.
2. Spec 15 requires human-vs-agent selection first, then a structured agent descriptor for non-human seats.
3. Corrected scope: this ticket should migrate runner contracts and UI defaults, but not implement new policy logic itself.

## Architecture Check

1. A `SeatController` shape is cleaner than continuing to encode controller kind and agent kind in one string field.
2. Keeping the runner on structured descriptors aligns it with the engine contract and removes duplicated parsing logic.
3. No runner-only string shims should persist as the authoritative seat contract.

## What to Change

### 1. Replace legacy runner seat strings

Introduce runner-side seat controller shapes:

- `{ kind: 'human' }`
- `{ kind: 'agent'; agent: AgentDescriptor }`

### 2. Update AI move policy and session/store plumbing

Make the runner resolve non-human seats through structured descriptors and default them to authored `policy`.

### 3. Update pre-game configuration UX

Expose:

- human vs agent first
- agent mode/details second
- built-in random/greedy as explicit opt-in tools

## File List

- `packages/runner/src/store/store-types.ts` (modify)
- `packages/runner/src/session/session-types.ts` (modify)
- `packages/runner/src/store/ai-move-policy.ts` (modify)
- `packages/runner/src/ui/PreGameConfigScreen.tsx` (modify)
- `packages/runner/src/store/game-store.ts` (modify as needed)
- `packages/runner/test/store/ai-move-policy.test.ts` (new/modify)
- `packages/runner/test/ui/pre-game-config-screen.test.tsx` (new/modify)

## Out of Scope

- engine evaluator or preview changes
- authored FITL/Texas policy content
- browser stress/performance harness work unrelated to seat descriptor migration

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/store/ai-move-policy.test.ts` proves non-human seats default to authored `policy` descriptors and built-in random/greedy remain opt-in.
2. `packages/runner/test/ui/pre-game-config-screen.test.tsx` proves the pre-game UI edits structured human/agent descriptors rather than legacy `ai-*` strings.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Runner seat configuration distinguishes controller kind from agent descriptor kind.
2. Authored `policy` becomes the default non-human execution path.
3. Built-in random/greedy remain available for debugging without shaping the runner architecture.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/ai-move-policy.test.ts` — seat-controller normalization and defaulting.
2. `packages/runner/test/ui/pre-game-config-screen.test.tsx` — UI state and serialization coverage.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm run check:ticket-deps`
