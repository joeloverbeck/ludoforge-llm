# 63CHOOPEROPT-008: Implement ChooseNSession with selection keys and caches

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — choose-n-session.ts
**Deps**: 63CHOOPEROPT-007

## Problem

The `ChooseNSession` holds the template, caches, and current state needed to recompute chooseN pending requests efficiently on each add/remove toggle without rerunning the full pipeline.

## Assumption Reassessment (2026-03-15)

1. Spec 7.1 defines canonical selection keys: stable index per option, bigint bitsets for domains up to 63-64 options, string keys above that.
2. Spec 7.2 defines two cache layers: `probeCache` (selected-set → probe summary) and `legalityCache` (selected-set → resolved option surface).
3. The session is internal — not serialized across Comlink, not visible to the store/UI.

## Architecture Check

1. The session is a mutable object holding immutable template + mutable caches + current selection state.
2. Caches are session-local and cleared when the session is discarded.
3. Revision-based invalidation (simple counter, not state hash).

## What to Change

### 1. Implement canonical `SelectionKey` in `choose-n-session.ts`

- For domains up to 64 options: bigint bitset (set bit at option's domain index)
- For larger domains: sorted option key string
- `toSelectionKey(domainIndex: ReadonlyMap<string, number>, selected: readonly MoveParamValue[]): SelectionKey`

### 2. Implement `ChooseNSession` interface and factory

```typescript
interface ChooseNSession {
  readonly revision: number;
  readonly decisionKey: DecisionKey;
  readonly template: ChooseNTemplate;
  readonly probeCache: Map<SelectionKey, ProbeSummary>;
  readonly legalityCache: Map<SelectionKey, readonly ChoiceOption[]>;
  currentSelected: readonly MoveParamScalar[];
  currentPending: ChoicePendingChooseNRequest;
}
```

Factory: `createChooseNSession(template, initialSelected, initialPending, revision): ChooseNSession`

### 3. Implement session-aware toggle

`advanceChooseNWithSession(session, command): AdvanceChooseNResult`

Per spec 6.5:
1. Validate command against `session.currentPending`
2. Compute `nextSelected`
3. Validate selected sequence (using validator from 005)
4. Recompute pending from template (using `rebuildPendingFromTemplate` from 007)
5. Run singleton probe + witness search with session caches
6. Update `session.currentSelected` and `session.currentPending`

### 4. Revision-based staleness

- `isSessionValid(session, currentRevision): boolean` — checks revision match
- Session is discarded when revision mismatches (state mutation, undo, reset, move apply)

## Files to Touch

- `packages/engine/src/kernel/choose-n-session.ts` (modify — add session, keys, caches)

## Out of Scope

- Worker integration / revision counter management (63CHOOPEROPT-009)
- Worker API changes (63CHOOPEROPT-009)
- Store/bridge changes (63CHOOPEROPT-009)
- Diagnostics (63CHOOPEROPT-010)
- UI changes (63CHOOPEROPT-011)

## Acceptance Criteria

### Tests That Must Pass

1. New test: session creation from template + initial state produces valid session
2. New test: `advanceChooseNWithSession` with add command → correct pending, one recompute (not two full pipeline walks)
3. New test: `advanceChooseNWithSession` with remove command → correct pending, validator catches removal invalidation
4. New test: probe cache hit — add option A, then add option B; probes for overlapping selected sets hit cache
5. New test: revision mismatch → `isSessionValid` returns false
6. New test: canonical SelectionKey — bitset for small domains, string for large domains, both produce correct keys
7. New test: session equivalence — for any session-eligible chooseN, session recomputation matches stateless recomputation for identical selected sets (spec 11.5)
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Session caches are local to the session — cleared when session is discarded.
2. `advanceChooseNWithSession` produces identical results to stateless `advanceChooseN` for the same inputs.
3. Canonical selection keys are deterministic and stable.
4. Session is never serialized — it's an in-process optimization only.
5. The existing stateless `advanceChooseN` API remains unchanged as a fallback.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-session.test.ts` — session lifecycle, toggle flow, cache behavior, revision invalidation, equivalence with stateless path
2. `packages/engine/test/unit/kernel/choose-n-selection-keys.test.ts` — canonical key generation, bitset correctness, round-trip stability

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
